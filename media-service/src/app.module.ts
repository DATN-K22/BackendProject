import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { FileModule } from './modules/file/file.module';
import { CloudStorageModule } from './modules/cloud.storage/cloud-storage.module';

@Module({
  imports: [
    FileModule, 
    PrismaModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env`,
    }),
    CloudStorageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
