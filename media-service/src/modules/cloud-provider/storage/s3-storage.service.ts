import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ICloudStorageService, S3PartInfo } from './cloud-storage.interface';
import { ConfigService } from '@nestjs/config';

export interface MultipartUploadSession {
  uploadId: string;
  key: string;
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
}

@Injectable()
export class S3Service implements ICloudStorageService {
  private readonly logger = new Logger(S3Service.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly client: S3Client
  ) {}

  // ── Existing methods (giữ nguyên interface cũ) ─────────────────────────────

  async downloadFile(bucket: string, key: string): Promise<Buffer> {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await this.client.send(command);

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  async deleteFile(bucket: string, key: string): Promise<void> {
    const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
    await this.client.send(command);
  }

  // Single PUT presigned URL — dùng cho PDF/image
  async getPresignedUrl(bucket: string, key: string, contentType: string, expiresIn: number = 900): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  async listFiles(bucket: string, prefix?: string): Promise<string[]> {
    const command = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix });
    const response = await this.client.send(command);

    return (response.Contents ?? []).map((obj) => obj.Key).filter((key): key is string => !!key);
  }

  async fileExists(bucket: string, key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({ Bucket: bucket, Key: key });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  async getPresignedUrlForAccessing(bucket: string, key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }

  // ── Multipart Upload (video) ───────────────────────────────────────────────

  async createMultipartUpload(
    bucket: string,
    key: string,
    contentType: string = 'video/mp4'
  ): Promise<MultipartUploadSession> {
    const command = new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      Metadata: { 'upload-source': 'lms-platform' }
    });

    const response = await this.client.send(command);

    if (!response.UploadId) {
      throw new InternalServerErrorException('Failed to create multipart upload');
    }

    return { uploadId: response.UploadId, key };
  }

  async getPresignedUrlForPart(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  async completeMultipartUpload(bucket: string, key: string, uploadId: string, parts: UploadedPart[]): Promise<string> {
    const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);

    const command = new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sorted.map((p) => ({
          PartNumber: p.partNumber,
          ETag: p.etag
        }))
      }
    });

    const response = await this.client.send(command);
    this.logger.log(`Multipart upload completed: ${response.Location}`);

    return response.Location ?? `https://${bucket}.s3.amazonaws.com/${key}`;
  }

  async abortMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void> {
    const command = new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId
    });

    await this.client.send(command);
    this.logger.warn(`Aborted multipart upload: ${uploadId} for key: ${key}`);
  }

  async listUploadedParts(bucket: string, key: string, uploadId: string): Promise<S3PartInfo[]> {
    const parts: S3PartInfo[] = [];
    let partNumberMarker: string | undefined;

    do {
      const command = new ListPartsCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumberMarker: partNumberMarker
      });

      const response = await this.client.send(command);

      for (const part of response.Parts ?? []) {
        parts.push({
          partNumber: part.PartNumber!,
          etag: part.ETag!,
          size: part.Size!
        });
      }

      partNumberMarker = response.IsTruncated ? response.NextPartNumberMarker : undefined;
    } while (partNumberMarker);

    return parts;
  }
}
