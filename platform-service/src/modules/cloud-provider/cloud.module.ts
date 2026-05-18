// cloud-storage/cloud-storage.module.ts

import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { S3Client } from '@aws-sdk/client-s3';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';

import { ICloudStorageService } from './storage/cloud-storage.interface';
import { CloudFrontService } from './cdn/cloudfront.service';
import { CDN_SERVICE, CLOUD_STORAGE_SERVICE } from '../../config/constant';
import { S3Service } from './storage/s3-storage.service';

@Global()
@Module({
  imports: [ConfigModule],

  providers: [
    {
      provide: CLOUD_STORAGE_SERVICE,

      useFactory: async (configService: ConfigService): Promise<ICloudStorageService> => {
        const provider = configService.get<string>('CLOUD_PROVIDER', 'aws');

        Logger.log(`Initializing cloud storage service for provider: ${provider}`);

        switch (provider) {
          case 'aws': {
            Logger.log('Using AWS S3 for cloud storage');

            const region = configService.get<string>('AWS_REGION') || 'ap-southeast-1';

            const roleArn = configService.get<string>('AWS_S3_ASSUME_ROLE_ARN');

            const accessKey = configService.get<string>('AWS_ACCESS_KEY');

            const secretKey = configService.get<string>('AWS_SECRET_KEY');

            const hasStaticCredentials = !!accessKey && !!secretKey;

            let client: S3Client;

            /**
             * =========================================================
             * CROSS ACCOUNT MODE
             * ECS Task Role / EC2 Role / Local Profile
             *    -> AssumeRole
             * Target S3 Role
             * =========================================================
             */
            if (roleArn) {
              Logger.log(`Using cross-account AssumeRole: ${roleArn}`);

              client = new S3Client({
                region,

                credentials: fromTemporaryCredentials({
                  clientConfig: {
                    region,

                    /**
                     * Optional:
                     * Only needed for local dev with explicit IAM user keys
                     */
                    ...(hasStaticCredentials
                      ? {
                          credentials: {
                            accessKeyId: accessKey!,
                            secretAccessKey: secretKey!
                          }
                        }
                      : {})
                  },

                  params: {
                    RoleArn: roleArn,
                    RoleSessionName: `media-service`
                  }
                })
              });

              Logger.log('Cross-account S3 client initialized successfully');
            } else {
              /**
               * =========================================================
               * SAME ACCOUNT MODE
               * Uses:
               * - ECS Task Role
               * - EC2 Role
               * - Local AWS profile
               * - Explicit static credentials
               * =========================================================
               */

              client = new S3Client({
                region,

                ...(hasStaticCredentials
                  ? {
                      credentials: {
                        accessKeyId: accessKey!,
                        secretAccessKey: secretKey!
                      }
                    }
                  : {})
              });

              Logger.log(
                hasStaticCredentials ? 'Using static AWS credentials' : 'Using AWS default credential provider chain'
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
        const provider = configService.get<string>('CLOUD_PROVIDER', 'aws');

        switch (provider) {
          case 'aws':
            return new CloudFrontService(configService);

          default:
            throw new Error(`Unsupported cloud cdn provider: ${provider}`);
        }
      },

      inject: [ConfigService]
    }
  ],

  exports: [CLOUD_STORAGE_SERVICE, CDN_SERVICE]
})
export class CloudStorageModule {}
