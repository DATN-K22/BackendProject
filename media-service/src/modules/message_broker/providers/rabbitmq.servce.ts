// providers/rabbitmq.service.ts
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices'
import { IMessageBroker } from '../message-broker.interface'

@Injectable()
export class RabbitMQService implements IMessageBroker {
  private client: ClientProxy

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('MESSAGE_BROKER_URL', 'amqp://guest:guest@localhost:5672')

    this.client = ClientProxyFactory.create({
      transport: Transport.RMQ,
      options: {
        urls: [url],
        queue: 'mail_queue',
        queueOptions: { durable: true }
      }
    })
  }

  async sendMail(to: string): Promise<any> {
    return this.client.emit('send_mail', { to })
  }
}
