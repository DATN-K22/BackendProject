import { Test, TestingModule } from '@nestjs/testing';
import { PaymentController } from './payment.controller';
import { PAYMENT_PROVIDER } from './payment.interface';

describe('PaymentController', () => {
  let controller: PaymentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        {
          provide: PAYMENT_PROVIDER,
          useValue: {
            createPayment: jest.fn(),
            getPaymentStatus: jest.fn(),
            cancelPayment: jest.fn(),
            handleWebhook: jest.fn()
          }
        }
      ]
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
