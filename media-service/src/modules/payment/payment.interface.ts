import { PaymentCreationDto } from './dto/payment.request.dto';

export interface PaymentLinkResponse {
  createPayment(dto: PaymentCreationDto): any;
}
