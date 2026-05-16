import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ICDNService } from './cdn.interface';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
@Injectable()
export class CloudFrontService implements ICDNService {
  private readonly distributionDomain: string;
  private readonly keyPairId: string;
  private readonly privateKey: string;

  constructor(private readonly configService: ConfigService) {
    this.distributionDomain = this.configService.get<string>('CLOUDFRONT_DISTRIBUTION_DOMAIN', '');
    this.keyPairId = this.configService.get<string>('CLOUDFRONT_KEY_PAIR_ID', '');
    this.privateKey = this.configService.get<string>('CLOUDFRONT_PRIVATE_KEY', '');

    if (!this.distributionDomain || !this.keyPairId || !this.privateKey) {
      throw new InternalServerErrorException('CloudFront configuration is incomplete');
    }
  }

  async getPresignedUrlForCloudFront(s3_key: string, filename: string, expiresIn = 3600): Promise<string> {
    const url = getSignedUrl({
      url: `https://${this.distributionDomain}/${s3_key}/${filename}`,
      dateLessThan: new Date(Date.now() + expiresIn * 1000),
      keyPairId: this.keyPairId,
      privateKey: this.privateKey
    });
    return url;
  }
}
