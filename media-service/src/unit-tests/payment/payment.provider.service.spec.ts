import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException
} from '@nestjs/common';
import { PaymentCreationDto } from '../../modules/payment/dto/payment.request.dto';
import { PayosWebhookDto } from '../../modules/payment/dto/payment.webhook.dto';
import { PayosPaymentProvider } from '../../modules/payment/payment.payos.service';
// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockOrderCode = 123456789;
const mockUserId = 'user-001';
const mockCourseId = 'course-001';

const makeDto = (overrides: Partial<PaymentCreationDto> = {}): PaymentCreationDto => ({
  items: [{ name: 'Course A', price: 10, quantity: 2 }],
  description: 'Course purchase',
  buyerName: 'John Doe',
  buyerEmail: 'john@example.com',
  buyerPhone: '0901234567',
  buyerAddress: '123 Street',
  cancelUrl: 'https://example.com/cancel',
  returnUrl: 'https://example.com/return',
  invoice: undefined,
  ...overrides
});

const makeWebhookBody = (overrides: Partial<PayosWebhookDto> = {}): PayosWebhookDto => ({
  code: '00',
  desc: 'success',
  data: {
    orderCode: mockOrderCode,
    amount: 460000,
    code: '00',
    desc: 'Thanh toan thanh cong'
  } as any,
  signature: 'valid-signature',
  ...overrides
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRequests = {
  create: jest.fn(),
  get: jest.fn(),
  cancel: jest.fn()
};

const mockWebhooks = {
  verify: jest.fn()
};

const mockPayosClient = {
  paymentRequests: mockRequests,
  webhooks: mockWebhooks
} as any;

const mockHttp = {
  post: jest.fn()
} as any;

const mockRedis = {
  setNX: jest.fn(),
  del: jest.fn()
} as any;

const mockPrisma = {
  paymentRecord: {
    create: jest.fn(),
    update: jest.fn()
  },
  enrollJob: {
    create: jest.fn()
  },
  $transaction: jest.fn()
} as any;

// ─── Factory ──────────────────────────────────────────────────────────────────

const buildProvider = (vndMultiplier = 23000) =>
  new PayosPaymentProvider(mockPayosClient, vndMultiplier, mockHttp, mockRedis, mockPrisma);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PayosPaymentProvider', () => {
  let provider: PayosPaymentProvider;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    provider = buildProvider();
  });

  // ─── createPayment ──────────────────────────────────────────────────────────

  describe('createPayment()', () => {
    const payosResult = {
      orderCode: mockOrderCode,
      qrCode: 'data:image/png;base64,qr==',
      checkoutUrl: 'https://pay.payos.vn/web/abc',
      amount: 460000
    };

    it('should create payment and return mapped response', async () => {
      mockRequests.create.mockResolvedValue(payosResult);
      mockPrisma.paymentRecord.create.mockResolvedValue({ id: 'rec-1' });

      const result = await provider.createPayment(makeDto(), mockUserId, mockCourseId);

      expect(mockRequests.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.paymentRecord.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        orderCode: payosResult.orderCode,
        qrCode: payosResult.qrCode,
        checkoutUrl: payosResult.checkoutUrl,
        amount: payosResult.amount
      });
      expect(result.idempotencyKey).toBeDefined();
    });

    it('should convert USD → VND using vndMultiplier', async () => {
      mockRequests.create.mockResolvedValue(payosResult);
      mockPrisma.paymentRecord.create.mockResolvedValue({ id: 'rec-1' });

      // items: price=10, quantity=2 → 20 USD × 23000 = 460000 VND
      await provider.createPayment(makeDto(), mockUserId, mockCourseId);

      const payload = mockRequests.create.mock.calls[0][0];
      expect(payload.amount).toBe(460000);
    });

    it('should use "Course purchase" as default description when dto.description is undefined', async () => {
      mockRequests.create.mockResolvedValue(payosResult);
      mockPrisma.paymentRecord.create.mockResolvedValue({ id: 'rec-1' });

      await provider.createPayment(makeDto({ description: undefined }), mockUserId, mockCourseId);

      const payload = mockRequests.create.mock.calls[0][0];
      expect(payload.description).toBe('Course purchase');
    });

    it('should save PaymentRecord with status PENDING', async () => {
      mockRequests.create.mockResolvedValue(payosResult);
      mockPrisma.paymentRecord.create.mockResolvedValue({ id: 'rec-1' });

      await provider.createPayment(makeDto(), mockUserId, mockCourseId);

      expect(mockPrisma.paymentRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
            userId: mockUserId,
            courseId: mockCourseId
          })
        })
      );
    });

    it('should throw ConflictException on DUPLICATE_ORDER_CODE', async () => {
      mockRequests.create.mockRejectedValue({ code: 'DUPLICATE_ORDER_CODE' });

      await expect(provider.createPayment(makeDto(), mockUserId, mockCourseId)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException on INVALID_PARAMETER', async () => {
      mockRequests.create.mockRejectedValue({ code: 'INVALID_PARAMETER' });

      await expect(provider.createPayment(makeDto(), mockUserId, mockCourseId)).rejects.toThrow(BadRequestException);
    });

    it('should throw UnprocessableEntityException on INVALID_AMOUNT', async () => {
      mockRequests.create.mockRejectedValue({ code: 'INVALID_AMOUNT' });

      await expect(provider.createPayment(makeDto(), mockUserId, mockCourseId)).rejects.toThrow(
        UnprocessableEntityException
      );
    });

    it('should throw InternalServerErrorException on unknown error', async () => {
      mockRequests.create.mockRejectedValue(new Error('network timeout'));

      await expect(provider.createPayment(makeDto(), mockUserId, mockCourseId)).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  // ─── getPaymentStatus ───────────────────────────────────────────────────────

  describe('getPaymentStatus()', () => {
    it('should return orderCode and status', async () => {
      mockRequests.get.mockResolvedValue({ orderCode: mockOrderCode, status: 'PAID' });

      const result = await provider.getPaymentStatus(String(mockOrderCode));

      expect(mockRequests.get).toHaveBeenCalledWith(mockOrderCode);
      expect(result).toEqual({ orderCode: mockOrderCode, status: 'PAID' });
    });

    it('should throw BadRequestException when ORDER_NOT_FOUND', async () => {
      mockRequests.get.mockRejectedValue({ code: 'ORDER_NOT_FOUND' });

      await expect(provider.getPaymentStatus('999')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── cancelPayment ──────────────────────────────────────────────────────────

  describe('cancelPayment()', () => {
    it('should return { success: true } on successful cancellation', async () => {
      mockRequests.cancel.mockResolvedValue({});

      const result = await provider.cancelPayment(String(mockOrderCode));

      expect(mockRequests.cancel).toHaveBeenCalledWith(mockOrderCode);
      expect(result).toEqual({ success: true });
    });

    it('should throw ConflictException when ORDER_ALREADY_PAID', async () => {
      mockRequests.cancel.mockRejectedValue({ code: 'ORDER_ALREADY_PAID' });

      await expect(provider.cancelPayment('123')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when ORDER_ALREADY_CANCELLED', async () => {
      mockRequests.cancel.mockRejectedValue({ code: 'ORDER_ALREADY_CANCELLED' });

      await expect(provider.cancelPayment('123')).rejects.toThrow(ConflictException);
    });
  });

  // ─── registerWebhook ────────────────────────────────────────────────────────

  describe('registerWebhook()', () => {
    const { of } = require('rxjs');

    beforeEach(() => {
      process.env.PAYOS_WEBHOOK_URL = 'https://example.com/payment/webhook';
      process.env.PAYOS_CLIENT_ID = 'client-id';
      process.env.PAYOS_API_KEY = 'api-key';
    });

    it('should call PayOS confirm-webhook endpoint and return success', async () => {
      mockHttp.post.mockReturnValue(of({ data: { desc: 'Registered' } }));

      const result = await provider.registerWebhook();

      expect(mockHttp.post).toHaveBeenCalledWith(
        'https://api-merchant.payos.vn/confirm-webhook',
        { webhookUrl: process.env.PAYOS_WEBHOOK_URL },
        expect.objectContaining({ headers: expect.any(Object) })
      );
      expect(result).toEqual({ success: true, message: 'Registered' });
    });

    it('should throw mapped error when HTTP call fails', async () => {
      const { throwError } = require('rxjs');
      mockHttp.post.mockReturnValue(throwError(() => ({ code: 'UNAUTHORIZED' })));

      await expect(provider.registerWebhook()).rejects.toThrow(BadRequestException);
    });
  });

  // ─── verifyWebhook ──────────────────────────────────────────────────────────

  describe('verifyWebhook()', () => {
    it('should call webhooks.verify with body including success:true', async () => {
      const body = makeWebhookBody();
      mockWebhooks.verify.mockResolvedValue({});

      await provider.verifyWebhook(body);

      expect(mockWebhooks.verify).toHaveBeenCalledWith({ ...body, success: true });
    });

    it('should throw BadRequestException when signature is invalid', async () => {
      mockWebhooks.verify.mockRejectedValue({ code: 'SIGNATURE_INVALID' });

      await expect(provider.verifyWebhook(makeWebhookBody())).rejects.toThrow(BadRequestException);
    });
  });

  // ─── handleWebhook ──────────────────────────────────────────────────────────

  describe('handleWebhook()', () => {
    const buildTxFn =
      (paymentId = 'pay-1', paid = true) =>
      async (cb: (tx: any) => Promise<void>) => {
        const tx = {
          paymentRecord: {
            update: jest.fn().mockResolvedValue({ id: paymentId })
          },
          enrollJob: {
            create: jest.fn().mockResolvedValue({})
          }
        };
        await cb(tx);
        return tx; // expose for assertions
      };

    beforeEach(() => {
      mockWebhooks.verify.mockResolvedValue({});
      mockRedis.setNX.mockResolvedValue(true);
    });

    it('should verify webhook, update record to PAID, and create EnrollJob', async () => {
      let capturedTx: any;
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        capturedTx = {
          paymentRecord: { update: jest.fn().mockResolvedValue({ id: 'pay-1' }) },
          enrollJob: { create: jest.fn().mockResolvedValue({}) }
        };
        await cb(capturedTx);
      });

      const result = await provider.handleWebhook(makeWebhookBody());

      expect(mockWebhooks.verify).toHaveBeenCalledTimes(1);
      expect(mockRedis.setNX).toHaveBeenCalledWith(`webhook:payos:${mockOrderCode}`, '1', expect.any(Number));
      expect(capturedTx.paymentRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PAID' })
        })
      );
      expect(capturedTx.enrollJob.create).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.orderCode).toBe(mockOrderCode);
    });

    it('should update status to FAILED and NOT create EnrollJob when dataCode !== "00"', async () => {
      let capturedTx: any;
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        capturedTx = {
          paymentRecord: { update: jest.fn().mockResolvedValue({ id: 'pay-1' }) },
          enrollJob: { create: jest.fn() }
        };
        await cb(capturedTx);
      });

      const failedBody = makeWebhookBody({
        code: '01',
        data: { orderCode: mockOrderCode, amount: 460000, code: '01', desc: 'Failed' } as any
      });

      await provider.handleWebhook(failedBody);

      expect(capturedTx.paymentRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' })
        })
      );
      expect(capturedTx.enrollJob.create).not.toHaveBeenCalled();
    });

    it('should return early with "Already processed" on duplicate webhook', async () => {
      mockRedis.setNX.mockResolvedValue(false);

      const result = await provider.handleWebhook(makeWebhookBody());

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        orderCode: mockOrderCode,
        message: 'Already processed'
      });
    });

    it('should delete Redis key and rethrow when DB transaction fails', async () => {
      const dbError = new Error('DB connection lost');
      mockPrisma.$transaction.mockRejectedValue(dbError);

      await expect(provider.handleWebhook(makeWebhookBody())).rejects.toThrow(dbError);

      expect(mockRedis.del).toHaveBeenCalledWith(`webhook:payos:${mockOrderCode}`);
    });

    it('should throw when signature verification fails', async () => {
      mockWebhooks.verify.mockRejectedValue({ code: 'SIGNATURE_INVALID' });

      await expect(provider.handleWebhook(makeWebhookBody())).rejects.toThrow(BadRequestException);
      expect(mockRedis.setNX).not.toHaveBeenCalled();
    });
  });

  // ─── mapError (private — tested via public methods) ─────────────────────────

  describe('mapError() — via public method surface', () => {
    const errorCases: [string, any][] = [
      ['INVALID_PARAMETER', BadRequestException],
      ['INVALID_AMOUNT', UnprocessableEntityException],
      ['DUPLICATE_ORDER_CODE', ConflictException],
      ['ORDER_NOT_FOUND', BadRequestException],
      ['ORDER_ALREADY_PAID', ConflictException],
      ['ORDER_ALREADY_CANCELLED', ConflictException],
      ['UNAUTHORIZED', BadRequestException],
      ['SIGNATURE_INVALID', BadRequestException],
      ['INTERNAL_SERVER_ERROR', ServiceUnavailableException]
    ];

    it.each(errorCases)('should map PayOS error code %s → %s', async (code, ExpectedError) => {
      mockRequests.get.mockRejectedValue({ code });
      await expect(provider.getPaymentStatus('1')).rejects.toThrow(ExpectedError);
    });

    it('should throw BadRequestException for 4xx HTTP status without known code', async () => {
      mockRequests.get.mockRejectedValue({ response: { status: 422 }, message: 'Unprocessable' });
      await expect(provider.getPaymentStatus('1')).rejects.toThrow(BadRequestException);
    });

    it('should throw InternalServerErrorException for unknown errors', async () => {
      mockRequests.get.mockRejectedValue(new Error('socket hang up'));
      await expect(provider.getPaymentStatus('1')).rejects.toThrow(InternalServerErrorException);
    });
  });
});
