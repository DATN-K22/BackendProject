// providers/rabbitmq.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices'
import { IMessageBroker } from '../message-broker.interface'
import { firstValueFrom } from 'rxjs'

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
    Logger.log(`Sending mail to ${to} via RabbitMQ`, 'RabbitMQService')
    try {
      return await firstValueFrom(this.client.emit('send_mail', { to }))
    } catch (error) {
      Logger.error(`sendMail error: ${JSON.stringify(error)}`, 'RabbitMQService')
      throw error
    }
  }
}
