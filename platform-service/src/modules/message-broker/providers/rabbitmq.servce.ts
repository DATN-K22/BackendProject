// providers/rabbitmq.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';
import * as amqp from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import { IMessageBroker } from '../message-broker.interface';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class RabbitMQService implements IMessageBroker {
  private client: ClientProxy;
  private url: string;
  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('MESSAGE_BROKER_URL', 'amqp://guest:guest@localhost:5672');
    this.url = url
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
      const conn = await amqp.connect(this.url);
      const channel = await conn.createChannel();
      const message = {
        id: uuidv4(),
        task: 'ingestion.index_document',   
        args: [],
        kwargs: { document_id, source_uri, tenant_id },
        retries: 0,
        eta: null,
        expires: null,
      };

      channel.sendToQueue(
        'data_queue',
        Buffer.from(JSON.stringify(message)),
        {
          contentType: 'application/json',     
          contentEncoding: 'utf-8',            
          headers: {
            id: message.id,
            task: message.task,
            retries: 0,
            root_id: message.id,
            parent_id: null,
          }
        }
      );

      Logger.debug(`Sent task ${message.id} for document_id=${document_id}`);
      await channel.close();
      await conn.close();
    } catch (error) {
      Logger.error(`sendMail error: ${JSON.stringify(error)}`, 'RabbitMQService');
      throw error;
    }
  }
}
