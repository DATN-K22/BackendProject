import { Test, TestingModule } from '@nestjs/testing';
import { EmailController } from '../../modules/email/email.controller';
import { EmailService } from '../../modules/email/email.service';
import { Logger } from '@nestjs/common';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockEmailService = {
  handleSendMail: jest.fn()
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('EmailController', () => {
  let controller: EmailController;

  beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailController],
      providers: [{ provide: EmailService, useValue: mockEmailService }]
    }).compile();

    controller = module.get<EmailController>(EmailController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleSendMail()', () => {
    it('should call emailService.handleSendMail with the correct email', async () => {
      mockEmailService.handleSendMail.mockResolvedValue(undefined);
      const payload = { to: 'user@example.com' };

      await controller.handleSendMail(payload);

      expect(mockEmailService.handleSendMail).toHaveBeenCalledTimes(1);
      expect(mockEmailService.handleSendMail).toHaveBeenCalledWith('user@example.com');
    });

    it('should propagate errors thrown by emailService', async () => {
      mockEmailService.handleSendMail.mockRejectedValue(new Error('Failed to send verification email'));

      await expect(controller.handleSendMail({ to: 'user@example.com' })).rejects.toThrow(
        'Failed to send verification email'
      );
    });
  });
});
