import { Injectable } from '@nestjs/common';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { LabType } from '@prisma/client';
import * as https from 'https';

const CONSOLE_DESTINATIONS: Record<LabType, string> = {
  ec2: 'https://ap-southeast-1.console.aws.amazon.com/ec2/home?region=ap-southeast-1',
  s3: 'https://s3.console.aws.amazon.com/s3/home?region=ap-southeast-1',
  lambda:
    'https://ap-southeast-1.console.aws.amazon.com/lambda/home?region=ap-southeast-1',
  database:
    'https://ap-southeast-1.console.aws.amazon.com/rds/home?region=ap-southeast-1',
};

@Injectable()
export class AwsService {
  private readonly sts = new STSClient({ region: 'ap-southeast-1' });
  private readonly externalId = process.env.AWS_LAB_EXTERNAL_ID;

  async assumeLabRole(roleArn: string, labType: LabType, userId: string) {
    const sessionName = `user-${userId}-${labType}-${Date.now()}`;

    const response = await this.sts.send(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: sessionName,
        ExternalId: this.externalId,
        DurationSeconds: 3600,
      }),
    );

    return {
      sessionName,
      accessKeyId: response.Credentials!.AccessKeyId!,
      secretAccessKey: response.Credentials!.SecretAccessKey!,
      sessionToken: response.Credentials!.SessionToken!,
    };
  }

  async getFederatedConsoleUrl(
    credentials: Awaited<ReturnType<typeof this.assumeLabRole>>,
    labType: LabType,
  ): Promise<string> {
    // Step 1: lấy signin token
    const session = {
      sessionId: credentials.accessKeyId,
      sessionKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    };

    const signinToken = await new Promise<string>((resolve, reject) => {
      const url =
        `https://signin.aws.amazon.com/federation` +
        `?Action=getSigninToken` +
        `&SessionDuration=7200` +
        `&Session=${encodeURIComponent(JSON.stringify(session))}`;

      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(JSON.parse(data).SigninToken));
        res.on('error', reject);
      });
    });

    // Step 2: build console login URL
    const destination = CONSOLE_DESTINATIONS[labType];
    return (
      `https://signin.aws.amazon.com/federation` +
      `?Action=login` +
      `&Issuer=lab-platform` +
      `&Destination=${encodeURIComponent(destination)}` +
      `&SigninToken=${signinToken}`
    );
  }
}
