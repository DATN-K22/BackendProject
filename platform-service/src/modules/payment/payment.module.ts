import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PayOS } from '@payos/node';
import { PaymentController } from './payment.controller';
import { IPaymentProvider, PAYMENT_PROVIDER } from './payment.interface';
import { PayosPaymentProvider } from './payment.payos.service';
import { HttpModule, HttpService } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisCacheService } from '../redis/redis-cache.service';
import { EnrollJobWorker } from './payment.worker';
import { CourseModule } from '../course-service/course.module';

@Module({
  imports: [ConfigModule, HttpModule, CourseModule],
  controllers: [PaymentController],
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (
        configService: ConfigService,
        httpService: HttpService,
        redis: RedisCacheService,
        prisma: PrismaService
      ): IPaymentProvider => {
        const provider = configService.get<string>('PAYMENT_PROVIDER', 'payos').toLowerCase();

        if (provider === 'payos') {
          const client = new PayOS({
            clientId: configService.getOrThrow<string>('PAYOS_CLIENT_ID'),
            apiKey: configService.getOrThrow<string>('PAYOS_API_KEY'),
            checksumKey: configService.getOrThrow<string>('PAYOS_CHECKSUM_KEY')
          });

          const multiplier = configService.get<number>('PAYMENT_VND_MULTIPLIER', 25_000);
          return new PayosPaymentProvider(client, multiplier, httpService, redis, prisma);
        }

        throw new Error(`Unsupported payment provider: ${provider}`);
      },
      inject: [ConfigService, HttpService, RedisCacheService, PrismaService]
    },
    EnrollJobWorker
  ],
  // hello
  exports: [PAYMENT_PROVIDER]
})
export class PaymentModule {}
