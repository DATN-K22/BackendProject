import { Logger } from '@nestjs/common';
import { EmailService } from '../../modules/email/email.service';
import * as nodemailer from 'nodemailer';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock toàn bộ nodemailer trước khi module load
jest.mock('nodemailer');

const mockSendMail = jest.fn();

(nodemailer.createTransport as jest.Mock).mockReturnValue({
  sendMail: mockSendMail
});

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      EMAIL_USER: 'test@gmail.com',
      EMAIL_PASS: 'secret'
    };
    return config[key];
  })
};

const mockRedisCache = {
  set: jest.fn()
};

// ─── Factory ──────────────────────────────────────────────────────────────────

const buildService = () => new EmailService(mockConfigService as any, mockRedisCache as any);

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('EmailService', () => {
  let service: EmailService;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply transport mock vì clearAllMocks reset return value
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail
    });
    service = buildService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should create nodemailer transporter with gmail config', () => {
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        service: 'gmail',
        auth: { user: 'test@gmail.com', pass: 'secret' }
      });
    });

    it('should fallback to empty string when config values are missing', () => {
      const emptyConfig = { get: jest.fn().mockReturnValue(undefined) };
      (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: jest.fn() });

      const svc = new EmailService(emptyConfig as any, mockRedisCache as any);
      expect(svc).toBeDefined();

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: { user: '', pass: '' }
        })
      );
    });
  });

  // ─── handleSendMail — success ───────────────────────────────────────────────

  describe('handleSendMail() — success', () => {
    const mockMessageId = '<msg-001@gmail.com>';

    beforeEach(() => {
      mockSendMail.mockResolvedValue({ messageId: mockMessageId });
      mockRedisCache.set.mockResolvedValue('OK');
    });

    it('should return success response with messageId, to, and expiresAt', async () => {
      const result = await service.handleSendMail('user@example.com');

      expect(result).toMatchObject({
        success: true,
        messageId: mockMessageId,
        to: 'user@example.com'
      });
      expect(result.expiresAt).toBeDefined();
    });

    it('should set OTP in Redis with key "otp:<email>" and TTL 300s', async () => {
      await service.handleSendMail('user@example.com');

      expect(mockRedisCache.set).toHaveBeenCalledWith('otp:user@example.com', expect.stringMatching(/^\d{6}$/), 300);
    });

    it('should generate a 6-digit numeric OTP', async () => {
      await service.handleSendMail('user@example.com');

      const [, otp] = mockRedisCache.set.mock.calls[0];
      expect(otp).toMatch(/^\d{6}$/);
      expect(Number(otp)).toBeGreaterThanOrEqual(100000);
      expect(Number(otp)).toBeLessThanOrEqual(999999);
    });

    it('should set expiresAt ~5 minutes from now', async () => {
      const before = Date.now();
      const result = await service.handleSendMail('user@example.com');
      const after = Date.now();

      const expiresAt = new Date(result.expiresAt).getTime();
      const expectedMin = before + 5 * 60 * 1000;
      const expectedMax = after + 5 * 60 * 1000;

      expect(expiresAt).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAt).toBeLessThanOrEqual(expectedMax);
    });

    it('should call transporter.sendMail with correct from, to, and subject', async () => {
      await service.handleSendMail('user@example.com');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"Learnaid" <test@gmail.com>',
          to: 'user@example.com',
          subject: '[Verification Account] OTP for Activate Your Account'
        })
      );
    });

    it('should include the OTP inside the HTML body', async () => {
      await service.handleSendMail('user@example.com');

      const [, otp] = mockRedisCache.set.mock.calls[0];
      const { html } = mockSendMail.mock.calls[0][0];

      expect(html).toContain(otp);
    });

    it('should skip Redis set when redisCache.set is undefined', async () => {
      const serviceWithoutRedisSet = new EmailService(
        mockConfigService as any,
        {} as any // no .set method
      );

      // Should not throw
      await expect(serviceWithoutRedisSet.handleSendMail('user@example.com')).resolves.toMatchObject({ success: true });

      expect(mockRedisCache.set).not.toHaveBeenCalled();
    });
  });

  // ─── handleSendMail — failure ───────────────────────────────────────────────

  describe('handleSendMail() — failure', () => {
    it('should throw "Failed to send verification email" when transporter fails', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP connection refused'));

      await expect(service.handleSendMail('user@example.com')).rejects.toThrow('Failed to send verification email');
    });

    it('should NOT store OTP in Redis when sendMail fails', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP error'));

      await expect(service.handleSendMail('user@example.com')).rejects.toThrow();

      expect(mockRedisCache.set).not.toHaveBeenCalled();
    });

    it('should throw when Redis set fails', async () => {
      mockSendMail.mockResolvedValue({ messageId: '<ok>' });
      mockRedisCache.set.mockRejectedValue(new Error('Redis down'));

      await expect(service.handleSendMail('user@example.com')).rejects.toThrow('Failed to send verification email');
    });
  });
});
