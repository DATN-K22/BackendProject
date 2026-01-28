// cloud-storage/interfaces/cloud-storage.interface.ts
export interface ICloudStorageService {
  downloadFile(bucket: string, key: string): Promise<Buffer>;

  deleteFile(bucket: string, key: string): Promise<void>;

  getPresignedUrl(
    bucket: string, 
    key: string,
    contentType: string,
    expiresIn?: number,
  ): Promise<string>;

  listFiles(bucket: string, prefix?: string): Promise<string[]>;

  fileExists(bucket: string, key: string): Promise<boolean>;
}