import { Injectable } from '@nestjs/common'
import { EmailService } from './email.service'
import { MessagePattern } from '@nestjs/microservices'

@Injectable()
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @MessagePattern('send_mail')
  async handleSendMail(to: string) {
    await this.emailService.handleSendMail(to)
  }
}
