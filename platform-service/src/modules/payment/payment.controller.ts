import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaymentCreationDto } from './dto/payment.request.dto';
import { PayosWebhookDto, WebhookResponseDto } from './dto/payment.webhook.dto';
import { IPaymentProvider, PAYMENT_PROVIDER } from './payment.interface';
import { ApiResponse as ApiResponseDto } from '../../utils/dto/ApiResponse';
@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  constructor(
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: IPaymentProvider
  ) {}

  @Post(':course_id/create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a PayOS payment link' })
  @ApiResponse({ status: 201, description: 'Returns checkoutUrl and QR code' })
  @ApiResponse({ status: 400, description: 'Invalid request payload' })
  @ApiResponse({ status: 409, description: 'Duplicate order code' })
  async createPayment(
    @Headers('x-user-id') userId: string,
    @Param('course_id') courseId: string,
    @Body() dto: PaymentCreationDto
  ) {
    return this.paymentProvider.createPayment(dto, userId, courseId);
  }

  /**
   * Webhook endpoint called by PayOS after each transaction.
   * Must NOT be behind an AuthGuard — authentication is handled
   * internally via HMAC-SHA256 checksum verification.
   * Register this URL in your PayOS dashboard.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PayOS webhook callback' })
  @ApiResponse({ status: 200, type: WebhookResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleWebhook(@Body() body: any): Promise<WebhookResponseDto> {
    return this.paymentProvider.handleWebhook(body);
  }

  @Post('webhook/register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register PayOS webhook' })
  async registerWebhook() {
    return this.paymentProvider.registerWebhook();
  }

  @Get('webhook')
  @HttpCode(HttpStatus.OK)
  verify() {
    // kkk
    return 'OK';
  }
  @Get(':orderCode/status')
  @ApiOperation({ summary: 'Get payment status' })
  @ApiParam({ name: 'orderCode', description: 'Order code' })
  @ApiResponse({ status: 200, description: 'Returns current payment status' })
  @ApiResponse({ status: 400, description: 'Order not found' })
  async getStatus(@Param('orderCode') orderCode: string) {
    return this.paymentProvider.getPaymentStatus(orderCode);
  }

  @Get('enroll-job/status/:course_id/:user_id')
  @ApiOperation({ summary: 'Get enroll job status by course and user' })
  @ApiParam({ name: 'course_id', description: 'Course ID' })
  @ApiParam({ name: 'user_id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Returns the latest enroll job status for the course and user' })
  async getEnrollJobStatus(@Param('course_id') courseId: string, @Param('user_id') userId: string) {
    return ApiResponseDto.OkResponse(await this.paymentProvider.getEnrollJobStatus(courseId, userId));
  }

  @Delete(':orderCode')
  @ApiOperation({ summary: 'Cancel a payment' })
  @ApiParam({ name: 'orderCode', description: 'Order code to cancel' })
  @ApiResponse({ status: 200, description: 'Cancelled successfully' })
  @ApiResponse({ status: 409, description: 'Order already paid or cancelled' })
  async cancelPayment(@Param('orderCode') orderCode: string) {
    return this.paymentProvider.cancelPayment(orderCode);
  }
}
