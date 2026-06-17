import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { FileModule } from './modules/file/file.module';
import { RedisModule } from './modules/redis/redis.module';
import { EmailModule } from './modules/email/email.module';
import { PaymentModule } from './modules/payment/payment.module';
import { CloudStorageModule } from './modules/cloud-provider/cloud.module';
import { CourseModule } from './modules/course-service/course.module';
import { MessageBrokerModule } from './modules/message-broker/message-broker.module';

@Module({
  imports: [
    FileModule,
    PrismaModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env`
    }),
    CloudStorageModule,
    RedisModule,
    EmailModule,
    PaymentModule,
    CourseModule,
    MessageBrokerModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
