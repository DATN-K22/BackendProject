// cloud-storage/interfaces/cloud-storage.interface.ts
export interface ICloudStorageService {
  downloadFile(bucket: string, key: string): Promise<Buffer>;

  deleteFile(bucket: string, key: string): Promise<void>;

  // This is used to generate presigned URL for direct upload
  // from FE to S3, so it needs bucket, key, contentType and expiresIn
  /**
   * Generates a presigned URL for uploading files directly to S3
   * @param bucket The S3 bucket name
   * @param key The object key in S3
   * @param contentType The content type of the file
   * @param expiresIn The expiration time for the presigned URL in seconds
   * @returns A promise resolving to the presigned URL
   */
  getPresignedUrl(bucket: string, key: string, contentType: string, expiresIn?: number): Promise<string>;

  listFiles(bucket: string, prefix?: string): Promise<string[]>;

  fileExists(bucket: string, key: string): Promise<boolean>;

  extractKeyFromUrl(url: string): string;

  getPresignedUrlForAccessing(bucket: string, key: string): Promise<string>;
}
