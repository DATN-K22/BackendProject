import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './modules/auth/auth.module'
import { ConfigModule } from '@nestjs/config/dist/config.module'
import { ScheduleModule } from './schedule/schedule.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    PrismaModule,
    AuthModule, 
    ScheduleModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
