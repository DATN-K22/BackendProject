import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { PaymentController } from '../../modules/payment/payment.controller';
import { PAYMENT_PROVIDER } from '../../modules/payment/payment.interface';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const mockUserId = 'user-123';
const mockCourseId = 'course-abc';
const mockOrderCode = 'ORDER-001';

const mockPaymentCreationDto = {
  items: [
    { name: 'Course A', price: 100, quantity: 1 },
    { name: 'Course B', price: 50, quantity: 2 }
  ]
};

const mockPaymentResponse = {
  checkoutUrl: 'https://pay.payos.vn/web/abc123',
  qrCode: 'data:image/png;base64,mockQR==',
  orderCode: mockOrderCode
};

const mockWebhookResponse = {
  success: true,
  message: 'Webhook processed'
};

const mockPaymentStatus = {
  orderCode: mockOrderCode,
  status: 'PAID',
  amount: 200
};

// ─── Mock Provider ────────────────────────────────────────────────────────────

const mockPaymentProvider = {
  createPayment: jest.fn(),
  handleWebhook: jest.fn(),
  registerWebhook: jest.fn(),
  getPaymentStatus: jest.fn(),
  cancelPayment: jest.fn()
};

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('PaymentController', () => {
  let controller: PaymentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        {
          provide: PAYMENT_PROVIDER,
          useValue: mockPaymentProvider
        }
      ]
    }).compile();

    controller = module.get<PaymentController>(PaymentController);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── createPayment ──────────────────────────────────────────────────────────

  describe('createPayment()', () => {
    it('should call paymentProvider.createPayment with correct arguments', async () => {
      mockPaymentProvider.createPayment.mockResolvedValue(mockPaymentResponse);

      const result = await controller.createPayment(mockUserId, mockCourseId, mockPaymentCreationDto as any);

      expect(mockPaymentProvider.createPayment).toHaveBeenCalledTimes(1);
      expect(mockPaymentProvider.createPayment).toHaveBeenCalledWith(mockPaymentCreationDto, mockUserId, mockCourseId);
      expect(result).toEqual(mockPaymentResponse);
    });

    it('should propagate errors thrown by the provider', async () => {
      mockPaymentProvider.createPayment.mockRejectedValue(new Error('Duplicate order code'));

      await expect(controller.createPayment(mockUserId, mockCourseId, mockPaymentCreationDto as any)).rejects.toThrow(
        'Duplicate order code'
      );
    });
  });

  // ─── handleWebhook ──────────────────────────────────────────────────────────

  describe('handleWebhook()', () => {
    it('should call paymentProvider.handleWebhook with the raw body', async () => {
      const webhookBody = { data: { orderCode: mockOrderCode }, signature: 'abc' };
      mockPaymentProvider.handleWebhook.mockResolvedValue(mockWebhookResponse);

      const result = await controller.handleWebhook(webhookBody);

      expect(mockPaymentProvider.handleWebhook).toHaveBeenCalledTimes(1);
      expect(mockPaymentProvider.handleWebhook).toHaveBeenCalledWith(webhookBody);
      expect(result).toEqual(mockWebhookResponse);
    });

    it('should propagate errors when signature is invalid', async () => {
      mockPaymentProvider.handleWebhook.mockRejectedValue(new Error('Invalid signature'));

      await expect(controller.handleWebhook({ signature: 'bad' })).rejects.toThrow('Invalid signature');
    });
  });

  // ─── registerWebhook ────────────────────────────────────────────────────────

  describe('registerWebhook()', () => {
    it('should call paymentProvider.registerWebhook and return result', async () => {
      const registerResult = { webhookUrl: 'https://example.com/payment/webhook' };
      mockPaymentProvider.registerWebhook.mockResolvedValue(registerResult);

      const result = await controller.registerWebhook();

      expect(mockPaymentProvider.registerWebhook).toHaveBeenCalledTimes(1);
      expect(result).toEqual(registerResult);
    });

    it('should propagate errors from the provider', async () => {
      mockPaymentProvider.registerWebhook.mockRejectedValue(new Error('Registration failed'));

      await expect(controller.registerWebhook()).rejects.toThrow('Registration failed');
    });
  });

  // ─── verify (GET /webhook) ──────────────────────────────────────────────────

  describe('verify()', () => {
    it('should return "OK"', () => {
      const result = controller.verify();
      expect(result).toBe('OK');
    });
  });

  // ─── getStatus ──────────────────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('should call paymentProvider.getPaymentStatus with the correct orderCode', async () => {
      mockPaymentProvider.getPaymentStatus.mockResolvedValue(mockPaymentStatus);

      const result = await controller.getStatus(mockOrderCode);

      expect(mockPaymentProvider.getPaymentStatus).toHaveBeenCalledTimes(1);
      expect(mockPaymentProvider.getPaymentStatus).toHaveBeenCalledWith(mockOrderCode);
      expect(result).toEqual(mockPaymentStatus);
    });

    it('should propagate errors when order is not found', async () => {
      mockPaymentProvider.getPaymentStatus.mockRejectedValue(new Error('Order not found'));

      await expect(controller.getStatus('INVALID-CODE')).rejects.toThrow('Order not found');
    });
  });

  // ─── cancelPayment ──────────────────────────────────────────────────────────

  describe('cancelPayment()', () => {
    it('should call paymentProvider.cancelPayment with the correct orderCode', async () => {
      const cancelResult = { success: true, message: 'Cancelled successfully' };
      mockPaymentProvider.cancelPayment.mockResolvedValue(cancelResult);

      const result = await controller.cancelPayment(mockOrderCode);

      expect(mockPaymentProvider.cancelPayment).toHaveBeenCalledTimes(1);
      expect(mockPaymentProvider.cancelPayment).toHaveBeenCalledWith(mockOrderCode);
      expect(result).toEqual(cancelResult);
    });

    it('should propagate errors when order is already paid or cancelled', async () => {
      mockPaymentProvider.cancelPayment.mockRejectedValue(new Error('Order already paid or cancelled'));

      await expect(controller.cancelPayment(mockOrderCode)).rejects.toThrow('Order already paid or cancelled');
    });
  });
});
