// cloud-storage/cloud-storage.module.ts
import { Module, Global, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CDN_SERVICE, CLOUD_STORAGE_INITIALIZER, CLOUD_STORAGE_SERVICE } from 'src/config/constant';
import { CloudStorageConfigInitializer } from '../../config/CloudStorageConfigInitializer';
import { S3Config } from '../../config/S3.config';
import { S3StorageService } from './storage/s3-storage.service';
import { ICloudStorageService } from './storage/cloud-storage.interface';
import { CloudFrontService } from './cdn/cloudfront.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CLOUD_STORAGE_INITIALIZER,
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>('CLOUD_PROVIDER', 'local');

        const initializer = new CloudStorageConfigInitializer(
          new Map([
            [
              'aws',
              new S3Config(
                configService.get<string>('AWS_REGION') || '',
                configService.get<string>('AWS_ACCESS_KEY') || '',
                configService.get<string>('AWS_SECRET_KEY') || ''
              )
            ]
            // Thêm provider khác nếu cần
          ]),
          provider
        );

        initializer.init();
        return initializer;
      },
      inject: [ConfigService]
    },
    // Provider cho CloudStorageService (Interface)
    {
      provide: CLOUD_STORAGE_SERVICE,
      useFactory: (configService: ConfigService, initializer: CloudStorageConfigInitializer): ICloudStorageService => {
        const provider = configService.get<string>('CLOUD_PROVIDER', 'local');

        switch (provider) {
          case 'aws': {
            const config = initializer.getCurrentConfig();
            if (config instanceof S3Config) {
              Logger.log('Using AWS S3 for cloud storage');
              return new S3StorageService(config.getClient());
            }
            throw new Error('AWS config is not properly initialized');
          }
          default:
            throw new Error(`Unsupported cloud provider: ${provider}`);
        }
      },
      inject: [ConfigService, CLOUD_STORAGE_INITIALIZER]
    },
    {
      provide: CDN_SERVICE,
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>('CLOUD_PROVIDER', 'local');
        switch (provider) {
          case 'aws': {
            return new CloudFrontService(configService);
          }
          default:
            throw new Error(`Unsupported cloud provider: ${provider}`);
        }
      },
      inject: [ConfigService]
    }
  ],
  exports: [CLOUD_STORAGE_SERVICE, CDN_SERVICE]
})
export class CloudStorageModule {}
