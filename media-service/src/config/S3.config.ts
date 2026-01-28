// S3.config.ts
import { CloudStorageConfig } from './CloudStorageConfig';
import { S3Client } from '@aws-sdk/client-s3';
import { S3RequestPresigner } from '@aws-sdk/s3-request-presigner';
import { Credentials } from '@aws-sdk/types';

export class S3Config implements CloudStorageConfig {
  private client: S3Client | null = null;
  private presigner: S3RequestPresigner | null = null;

  constructor(
    private readonly region: string,
    private readonly accessKey: string,
    private readonly secretKey: string,
  ) {}

  configure(): void {
    const credentials: Credentials = {
      accessKeyId: this.accessKey,
      secretAccessKey: this.secretKey,
    };

    this.client = new S3Client({
      region: this.region,
      credentials,
    });

    this.presigner = new S3RequestPresigner({
      region: this.region,
      credentials,
      sha256: this.client.config.sha256,
    });
  }

  getClient(): S3Client {
    if (!this.client) {
      throw new Error('S3Client is not initialized. Call configure() first.');
    }
    return this.client;
  }

  getPresigner(): S3RequestPresigner {
    if (!this.presigner) {
      throw new Error('S3Presigner is not initialized. Call configure() first.');
    }
    return this.presigner;
  }
}