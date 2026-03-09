import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './modules/auth/auth.module'
import { ConfigModule } from '@nestjs/config/dist/config.module'
import { ScheduleModule } from './modules/schedule/schedule.module'
import { UserModule } from './modules/user/user.module'
import { McpAuthModule, McpModule } from '@rekog/mcp-nest'

@Module({
  imports: [
    McpModule.forRoot({
      name: "schedule-mcp",
      version:'1.0.0'
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env'
    }),
    PrismaModule,
    AuthModule,
    ScheduleModule,
    UserModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
