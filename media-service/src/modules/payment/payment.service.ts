import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayOS } from '@payos/node';
import { PaymentCreationDto } from './dto/payment.request.dto';
@Injectable()
export class PaymentService {
  private payos: any;

  constructor(private configService: ConfigService) {
    const client = new PayOS({
      clientId: this.configService.get('PAYOS_CLIENT_ID'),
      apiKey: this.configService.get('PAYOS_API_KEY'),
      checksumKey: this.configService.get('PAYOS_CHECKSUM_KEY')
    });

    this.payos = client.paymentRequests;
  }
  async createPayment(dto: PaymentCreationDto) {
    const orderCode = Date.now();
    const amount = dto.items.reduce((total, item) => total + item.price * item.quantity, 0);
    Logger.log(`Creating payment with orderCode: ${orderCode}, amount: ${amount}`);
    try {
      const paymentRequestPayload = {
        ...dto,
        orderCode,
        amount: amount * 25000,
        description: dto.description || `Mua khoa hoc`,
        invoice: dto.invoice
          ? {
              buyerNotGetInvoice: dto.invoice.buyerNotGetInvoice,
              taxPercentage: dto.invoice.taxPercentage
            }
          : undefined
      };

      const paymentLink = await this.payos.create(paymentRequestPayload);

      return {
        orderCode: paymentLink.orderCode,
        qrCode: paymentLink.qrCode,
        checkoutUrl: paymentLink.checkoutUrl,
        amount: paymentLink.amount
      };
    } catch (error) {
      console.error('PayOS error:', error);
      throw new InternalServerErrorException('Không thể tạo đơn thanh toán');
    }
  }

  async getPaymentStatus(orderCode: string) {
    try {
      const payment = await this.payos.get(Number(orderCode));
      return { status: payment.status };
    } catch (error) {
      throw new InternalServerErrorException('Không thể lấy trạng thái');
    }
  }

  async cancelPayment(orderCode: string) {
    try {
      await this.payos.cancel(Number(orderCode));
      return { success: true };
    } catch (error) {
      throw new InternalServerErrorException('Không thể huỷ đơn');
    }
  }
}
