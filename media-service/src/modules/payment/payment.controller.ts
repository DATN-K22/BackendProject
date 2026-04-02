import { Body, Controller, Post } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentCreationDto } from './dto/payment.request.dto';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('create')
  async createPayment(@Body() paymentDto: PaymentCreationDto) {
    return this.paymentService.createPayment(paymentDto);
  }
}
