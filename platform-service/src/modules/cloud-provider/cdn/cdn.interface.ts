export interface ICDNService {
  /**
   * Generates a presigned URL for accessing files through CloudFront
   * @param s3_key The object key in S3 (the path in s3 bucket)
   * @param expiresIn The expiration time for the presigned URL in seconds
   * @returns A promise resolving to the presigned URL
   */
  getPresignedUrlForCloudFront(s3_key: string, filename: string, expiresIn?: number): Promise<string>;
}
