import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { RedisCacheService } from '../redis/redis-cache.service';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);
  private readonly EMAIL_USER: string;
  private readonly EMAIL_PASS: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisCache: RedisCacheService
  ) {
    this.EMAIL_USER = configService.get<string>('EMAIL_USER') ?? '';
    this.EMAIL_PASS = configService.get<string>('EMAIL_PASS') ?? '';

    const transport = {
      service: 'gmail',
      auth: {
        user: this.EMAIL_USER,
        pass: this.EMAIL_PASS
      }
    };
    this.transporter = nodemailer.createTransport(transport);
  }

  async handleSendMail(to: string) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
    const ttlSeconds = 5 * 60;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const mailOptions = {
      from: `"Learnaid" <${this.EMAIL_USER}>`,
      to,
      subject: '[Verification Account] OTP for Activate Your Account',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Account Verification</h2>
          <p>Your OTP code is:</p>
          <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${otp}</p>
          <p>This code will expire in 5 minutes.</p>
          <p>If you did not request this, please ignore this email.</p>
        </div>
      `
    };

    try {
      ``;
      const info = await this.transporter.sendMail(mailOptions);

      if (this.redisCache.set) {
        await this.redisCache.set(`otp:${to}`, otp, ttlSeconds);
      }
      this.logger.log(`Email sent successfully: ${info.messageId}`);
      return {
        success: true,
        messageId: info.messageId,
        to,
        expiresAt: expiresAt.toISOString()
      };
    } catch (error) {
      this.logger.error('Error sending email:', error);
      throw new Error('Failed to send verification email');
    }
  }
}
