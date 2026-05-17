// cloud-storage/cloud-storage.module.ts

import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';

import { CloudStorageConfigInitializer } from '../../config/CloudStorageConfigInitializer';
import { ICloudStorageService } from './storage/cloud-storage.interface';
import { CloudFrontService } from './cdn/cloudfront.service';
import { CDN_SERVICE, CLOUD_STORAGE_INITIALIZER, CLOUD_STORAGE_SERVICE } from '../../config/constant';
import { S3Service } from './storage/s3-storage.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CLOUD_STORAGE_INITIALIZER,
      useFactory: async (configService: ConfigService) => {
        const provider = configService.get<string>('CLOUD_PROVIDER', 'local');

        const initializer = new CloudStorageConfigInitializer(new Map(), provider);

        initializer.init();

        return initializer;
      },
      inject: [ConfigService]
    },

    {
      provide: CLOUD_STORAGE_SERVICE,
      useFactory: async (configService: ConfigService): Promise<ICloudStorageService> => {
        const provider = configService.get<string>('CLOUD_PROVIDER', 'local');

        switch (provider) {
          case 'aws': {
            Logger.log('Using AWS S3 for cloud storage');

            const region = configService.get<string>('AWS_REGION') || 'ap-southeast-1';

            const roleArn = configService.get<string>('AWS_S3_ASSUME_ROLE_ARN');

            let client: S3Client;

            /**
             * =========================================================
             * CROSS ACCOUNT MODE
             * ECS Task Role (Account A)
             *   -> AssumeRole
             * S3 Role (Account B)
             * =========================================================
             */
            if (roleArn) {
              Logger.log(`Assuming cross-account role: ${roleArn}`);

              const sts = new STSClient({
                region
              });

              const assumed = await sts.send(
                new AssumeRoleCommand({
                  RoleArn: roleArn,
                  RoleSessionName: `media-service-${Date.now()}`
                })
              );

              if (!assumed.Credentials) {
                throw new Error('Failed to assume cross-account S3 role');
              }

              client = new S3Client({
                region,
                credentials: {
                  accessKeyId: assumed.Credentials.AccessKeyId!,
                  secretAccessKey: assumed.Credentials.SecretAccessKey!,
                  sessionToken: assumed.Credentials.SessionToken!
                }
              });

              Logger.log('Cross-account S3 client initialized successfully');
            } else {
              /**
               * =========================================================
               * SAME ACCOUNT MODE
               * Uses:
               * - ECS Task Role
               * - EC2 Role
               * - Local AWS credentials
               * - Explicit env keys
               * =========================================================
               */

              const accessKey = configService.get<string>('AWS_ACCESS_KEY');

              const secretKey = configService.get<string>('AWS_SECRET_KEY');

              const hasStaticCredentials = !!accessKey && !!secretKey;

              client = new S3Client({
                region,
                ...(hasStaticCredentials
                  ? {
                      credentials: {
                        accessKeyId: accessKey,
                        secretAccessKey: secretKey
                      }
                    }
                  : {})
              });

              Logger.log(
                hasStaticCredentials
                  ? 'Using static AWS credentials'
                  : 'Using AWS default credential provider chain (ECS Task Role / EC2 Role / Local Profile)'
              );
            }

            return new S3Service(configService, client);
          }

          default:
            throw new Error(`Unsupported cloud provider: ${provider}`);
        }
      },
      inject: [ConfigService]
    },

    {
      provide: CDN_SERVICE,
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>('CLOUD_PROVIDER', 'local');

        switch (provider) {
          case 'aws':
            return new CloudFrontService(configService);

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
