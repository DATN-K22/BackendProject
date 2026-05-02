import {
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException
} from '@nestjs/common';
import { PayOS } from '@payos/node';
import { randomUUID } from 'crypto';
import { PaymentCreationDto } from './dto/payment.request.dto';
import { PayosWebhookDto, WebhookResponseDto } from './dto/payment.webhook.dto';
import {
  CancelPaymentResponse,
  CreatePaymentPayload,
  CreatePaymentResponse,
  IPaymentProvider,
  PaymentStatusResult
} from './payment.interface';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { RedisCacheService } from '../redis/redis-cache.service';
import { PrismaService } from '../../prisma/prisma.service';

const PAYOS_ERROR_MAP: Record<string, () => HttpException> = {
  INVALID_PARAMETER: () => new BadRequestException('Invalid request parameters'),
  INVALID_AMOUNT: () => new UnprocessableEntityException('Invalid payment amount (min 2000 VND)'),
  DUPLICATE_ORDER_CODE: () => new ConflictException('Order code already exists, please retry'),
  ORDER_NOT_FOUND: () => new BadRequestException('Order not found'),
  ORDER_ALREADY_PAID: () => new ConflictException('Order has already been paid'),
  ORDER_ALREADY_CANCELLED: () => new ConflictException('Order has already been cancelled'),
  UNAUTHORIZED: () => new BadRequestException('Invalid PayOS credentials'),
  SIGNATURE_INVALID: () => new BadRequestException('Invalid signature'),
  INTERNAL_SERVER_ERROR: () => new ServiceUnavailableException('PayOS is currently unavailable, please try again later')
};

export class PayosPaymentProvider implements IPaymentProvider {
  private readonly logger = new Logger(PayosPaymentProvider.name);
  private readonly requests: InstanceType<typeof PayOS>['paymentRequests'];
  private readonly webhooks: InstanceType<typeof PayOS>['webhooks'];
  private readonly IDEMPOTENCY_TTL = 60 * 60 * 24 * 7;

  constructor(
    client: PayOS,
    private readonly vndMultiplier: number,
    private readonly http: HttpService,
    private readonly redis: RedisCacheService,
    private readonly prisma: PrismaService
  ) {
    this.requests = client.paymentRequests;
    this.webhooks = client.webhooks;
  }

  async createPayment(dto: PaymentCreationDto, userId: string, courseId: string): Promise<CreatePaymentResponse> {
    const idempotencyKey = randomUUID();
    const orderCode = this.generateOrderCode();
    const amountVnd = Math.round(
      dto.items.reduce((sum, item) => sum + item.price * item.quantity, 0) * this.vndMultiplier
    );

    this.logger.log(
      `Creating payment - orderCode: ${orderCode}, userId: ${userId}, courseId: ${courseId}, amount: ${amountVnd} VND`
    );

    const payload: CreatePaymentPayload = {
      orderCode,
      amount: amountVnd,
      description: dto.description ?? 'Course purchase',
      buyerName: dto.buyerName,
      buyerEmail: dto.buyerEmail,
      buyerPhone: dto.buyerPhone,
      buyerAddress: dto.buyerAddress,
      items: dto.items,
      cancelUrl: dto.cancelUrl,
      returnUrl: dto.returnUrl,
      invoice: dto.invoice
    };

    try {
      // 1. Gọi PayOS tạo payment link trước
      const result = await this.requests.create(payload);

      // 2. Lưu PaymentRecord vào DB ngay sau khi PayOS tạo thành công.
      //    Mục đích: webhook sau này tra cứu được userId và courseId theo orderCode.
      //    Status bắt đầu là PENDING — webhook sẽ update thành PAID hoặc FAILED.
      await this.prisma.paymentRecord.create({
        data: {
          orderCode: String(orderCode),
          userId,
          courseId,
          amount: amountVnd,
          status: 'PENDING',
          description: dto.description ?? 'Course purchase',
          buyerEmail: dto.buyerEmail,
          buyerName: dto.buyerName
        }
      });

      this.logger.log(`PaymentRecord created - orderCode: ${orderCode}`);

      return {
        orderCode: result.orderCode,
        qrCode: result.qrCode,
        checkoutUrl: result.checkoutUrl,
        amount: result.amount,
        idempotencyKey
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getPaymentStatus(orderCode: string): Promise<PaymentStatusResult> {
    this.logger.log(`Fetching payment status - orderCode: ${orderCode}`);

    try {
      const result = await this.requests.get(Number(orderCode));
      return { orderCode: result.orderCode, status: result.status };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async registerWebhook(): Promise<{ success: boolean; message?: string }> {
    const webhookUrl = process.env.PAYOS_WEBHOOK_URL;

    this.logger.log(`Registering PayOS webhook: ${webhookUrl}`);

    try {
      const res = await firstValueFrom(
        this.http.post(
          'https://api-merchant.payos.vn/confirm-webhook',
          { webhookUrl },
          {
            headers: {
              'x-client-id': process.env.PAYOS_CLIENT_ID,
              'x-api-key': process.env.PAYOS_API_KEY,
              'Content-Type': 'application/json'
            }
          }
        )
      );

      this.logger.log(`Webhook registered successfully`);
      return { success: true, message: res.data?.desc || 'Registered' };
    } catch (error) {
      this.logger.error(`Failed to register webhook: ${error}`, error);
      throw this.mapError(error);
    }
  }

  async cancelPayment(orderCode: string): Promise<CancelPaymentResponse> {
    this.logger.log(`Cancelling payment - orderCode: ${orderCode}`);

    try {
      await this.requests.cancel(Number(orderCode));
      return { success: true };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async verifyWebhook(body: PayosWebhookDto) {
    try {
      return await this.webhooks.verify({ ...body, success: true });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async handleWebhook(body: PayosWebhookDto): Promise<WebhookResponseDto> {
    // 1. Verify chữ ký PayOS.
    //    webhooks.verify() trả về data object bên trong, không phải root body.
    //    orderCode và amount lấy từ body.data — đây là nguồn đúng.
    await this.verifyWebhook(body);

    const { orderCode, amount } = body.data;

    // PayOS có code ở 2 tầng: root body.code và body.data.code.
    // Chỉ coi là PAID khi cả hai đều là '00'.
    const isPaid = body.code === '00' && body.data.code === '00';

    this.logger.log(`Webhook received - orderCode: ${orderCode}, rootCode: ${body.code}, dataCode: ${body.data.code}`);

    // 2. Chặn duplicate bằng Redis SETNX (atomic, không tốn DB query).
    const idempotencyKey = `webhook:payos:${orderCode}`;
    const acquired = await this.redis.setNX(idempotencyKey, '1', this.IDEMPOTENCY_TTL);

    if (!acquired) {
      this.logger.warn(`Duplicate webhook ignored - orderCode: ${orderCode}`);
      return { success: true, orderCode, message: 'Already processed' };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // 3. Update PaymentRecord đã được tạo sẵn từ createPayment.
        //    Không dùng upsert vì record phải tồn tại trước — tạo lúc createPayment.
        //    Nếu update throw P2025 (record not found) → PayOS sẽ retry sau khi
        //    Redis key bị xóa ở catch block bên dưới.
        const payment = await tx.paymentRecord.update({
          where: { orderCode: String(orderCode) },
          data: {
            status: isPaid ? 'PAID' : 'FAILED',
            paidAt: isPaid ? new Date() : null,
            rawWebhook: body as any
          }
        });

        // 4. Tạo EnrollJob chỉ khi thanh toán thành công.
        //    Worker riêng sẽ đọc EnrollJob và thực sự enroll user vào course
        //    dựa trên payment.userId và payment.courseId.
        if (isPaid) {
          await tx.enrollJob.create({
            data: {
              paymentId: payment.id,
              status: 'PENDING'
            }
          });
        }
      });
    } catch (err) {
      // 5. DB lỗi → xóa Redis key để PayOS có thể retry webhook sau.
      await this.redis.del(idempotencyKey);
      this.logger.error(`Webhook processing failed - orderCode: ${orderCode}`, err);
      throw err;
    }

    this.logger.log(`Webhook processed - orderCode: ${orderCode}, paid: ${isPaid}`);
    return { success: true, orderCode, message: body.desc };
  }

  private generateOrderCode(): number {
    const ts = String(Date.now()).slice(4);
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return Number(`${ts}${rand}`);
  }

  private mapError(error: unknown): HttpException {
    const raw = error as Record<string, any>;
    const code: string | undefined = raw?.code ?? raw?.response?.code ?? raw?.data?.code;
    const message: string = raw?.message ?? raw?.response?.desc ?? 'Unknown PayOS error';

    this.logger.error(`PayOS error — code: ${code ?? 'unknown'}, message: ${message}`, raw?.stack);

    if (code && PAYOS_ERROR_MAP[code]) {
      return PAYOS_ERROR_MAP[code]();
    }

    const httpStatus: number | undefined = raw?.response?.status ?? raw?.status;
    if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
      return new BadRequestException(message);
    }

    return new InternalServerErrorException('Payment gateway unavailable, please try again');
  }
}
