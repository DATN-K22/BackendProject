// providers/rabbitmq.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { IMessageBroker } from '../message-broker.interface';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class RabbitMQService implements IMessageBroker {
  private client: ClientProxy;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('MESSAGE_BROKER_URL', 'amqp://guest:guest@localhost:5672');

    this.client = ClientProxyFactory.create({
      transport: Transport.RMQ,
      options: {
        urls: [url],
        queue: 'data_queue',
        queueOptions: { durable: true }
      }
    });
  }

  async sendFileUrlForAIProcessing(document_id: string, source_uri: string, tenant_id: string): Promise<any> {
    try {
      Logger.debug(`emmit event ${document_id}`);
      return await firstValueFrom(this.client.emit('data_injestion', { document_id, source_uri, tenant_id }));
    } catch (error) {
      Logger.error(`sendMail error: ${JSON.stringify(error)}`, 'RabbitMQService');
      throw error;
    }
  }
}
