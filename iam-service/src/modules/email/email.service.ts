import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'
import { IMessageBroker } from '../message_broker/message-broker.interface'
import { RedisCacheService } from '../redis/redis-cache.service'
import { MESSAGE_BROKER } from '../message_broker/message-broker.token'

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter

  private readonly EMAIL_USER: string
  private readonly EMAIL_PASS: string
  constructor(
    private readonly configService: ConfigService,
    private readonly redisCache: RedisCacheService,

    @Inject(MESSAGE_BROKER)
    private readonly messageBroker: IMessageBroker
  ) {
    this.EMAIL_USER = configService.get<string>('EMAIL_USER')
    this.EMAIL_PASS = configService.get<string>('EMAIL_PASS')

    const transport = {
      service: 'gmail',
      auth: {
        user: this.EMAIL_USER,
        pass: this.EMAIL_PASS
      }
    }
    this.transporter = nodemailer.createTransport(transport)
  }

  async handleSendMail(to: string) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString() // 6 digits
    const ttlSeconds = 5 * 60
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000)

    const mailOptions = {
      from: `"Greenhouse HCMUT" <${this.EMAIL_USER}>`,
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
    }

    try {
      ;``
      const info = await this.transporter.sendMail(mailOptions)

      if (this.redisCache.set) {
        await this.redisCache.set(`otp:${to}`, otp, ttlSeconds)
      }
      console.log(`Email sent successfully: ${info.messageId}`)
      return {
        success: true,
        messageId: info.messageId,
        to,
        expiresAt: expiresAt.toISOString()
      }
    } catch (error) {
      console.error('Error sending email:', error)
      throw new Error('Failed to send verification email')
    }
  }
}
