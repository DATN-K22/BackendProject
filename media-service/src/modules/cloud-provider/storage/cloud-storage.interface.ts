export interface MultipartUploadSession {
  uploadId: string;
  key: string;
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
}

export interface S3PartInfo {
  partNumber: number;
  etag: string;
  size: number;
}

export interface ICloudStorageService {
  downloadFile(bucket: string, key: string): Promise<Buffer>;
  deleteFile(bucket: string, key: string): Promise<void>;
  getPresignedUrl(bucket: string, key: string, contentType: string, expiresIn?: number): Promise<string>;
  listFiles(bucket: string, prefix?: string): Promise<string[]>;
  fileExists(bucket: string, key: string): Promise<boolean>;
  // extractKeyFromUrl(url: string): string;
  getPresignedUrlForAccessing(bucket: string, key: string): Promise<string>;

  // ── Multipart Upload (video) ────────────────────────────────────────────────
  createMultipartUpload(bucket: string, key: string, contentType: string): Promise<MultipartUploadSession>;
  getPresignedUrlForPart(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn?: number
  ): Promise<string>;
  completeMultipartUpload(bucket: string, key: string, uploadId: string, parts: UploadedPart[]): Promise<string>;
  abortMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void>;
  listUploadedParts(bucket: string, key: string, uploadId: string): Promise<S3PartInfo[]>;
}
