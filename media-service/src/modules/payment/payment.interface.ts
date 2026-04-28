import { PaymentCreationDto } from './dto/payment.request.dto';
import { PayosWebhookDto, WebhookResponseDto } from './dto/payment.webhook.dto';

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

export interface CreatePaymentPayload {
  orderCode: number;
  amount: number;
  description: string;
  buyerName: string;
  buyerEmail?: string;
  buyerPhone?: string;
  buyerAddress?: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    unit?: string;
  }>;
  cancelUrl: string;
  returnUrl: string;
  invoice?: {
    buyerNotGetInvoice: boolean;
  };
}

export interface CreatePaymentResult {
  orderCode: number;
  qrCode: string;
  checkoutUrl: string;
  amount: number;
}

export interface PaymentStatusResult {
  orderCode: number;
  status: string;
}

export interface CreatePaymentResponse {
  orderCode: number;
  idempotencyKey: string;
  qrCode: string;
  checkoutUrl: string;
  amount: number;
}

export interface CancelPaymentResponse {
  success: boolean;
}

export interface IPaymentProvider {
  createPayment(dto: PaymentCreationDto, userId: string, courseId: string): Promise<CreatePaymentResponse>;
  getPaymentStatus(orderCode: string): Promise<PaymentStatusResult>;
  cancelPayment(orderCode: string): Promise<CancelPaymentResponse>;
  handleWebhook(body: PayosWebhookDto): Promise<WebhookResponseDto>;
  registerWebhook(): Promise<{ success: boolean; message?: string }>;
}
