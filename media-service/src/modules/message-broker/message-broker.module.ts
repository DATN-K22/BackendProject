import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IMessageBroker } from './message-broker.interface';
import { RabbitMQService } from './providers/rabbitmq.servce';
import { MESSAGE_BROKER } from './message-broker.token';
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MESSAGE_BROKER,
      useFactory: (configService: ConfigService): IMessageBroker => {
        const provider = configService.get<string>('MESSAGE_BROKER_PROVIDER', 'rabbitmq');

        switch (provider) {
          case 'rabbitmq':
            return new RabbitMQService(configService);

          // case 'console':
          //   return new ConsoleBrokerService(); // implement this

          default:
            throw new Error(`Unsupported MESSAGE_BROKER_PROVIDER: ${provider}`);
        }
      },
      inject: [ConfigService]
    }
  ],
  exports: [MESSAGE_BROKER]
})
export class MessageBrokerModule {}
