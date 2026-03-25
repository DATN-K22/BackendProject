import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MESSAGE_BROKER } from './message-broker.token'
import { IMessageBroker } from './message-broker.interface'
import { RabbitMQService } from './providers/rabbitmq.servce'

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MESSAGE_BROKER,
      useFactory: (configService: ConfigService): IMessageBroker => {
        const provider = configService.get<string>('MESSAGE_BROKER_PROVIDER', 'console')

        switch (provider) {
          case 'rabbitmq':
            return new RabbitMQService(configService)
          case 'console':
          default:
          // return new ConsoleBrokerService()
        }
      },
      inject: [ConfigService]
    }
  ],
  exports: [MESSAGE_BROKER]
})
export class MessageBrokerModule {}
