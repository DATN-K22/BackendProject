import { Controller } from '@nestjs/common';
import { EmailService } from './email.service';
import { EventPattern, Payload } from '@nestjs/microservices';

@Controller()
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  // Handler for the event pattern 'send_mail' which is emitted by the
  // message broker when a new user signs up.
  // It receives the email address as a parameter and calls the email service
  // to send a verification email.

  @EventPattern('send_mail')
  async handleSendMail(@Payload() payload: { to: string }) {
    await this.emailService.handleSendMail(payload.to);
  }
}
