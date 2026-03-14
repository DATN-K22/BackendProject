import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LabRepository } from './lab.repository';
import { MediaClient } from '../media-service/MediaClient';
import { PrismaService } from '../prisma/prisma.service';
import { LabMode } from '@prisma/client';
import { AwsService } from './aws';

@Injectable()
export class LabService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aws: AwsService,
    private readonly labRepository: LabRepository,

    @Inject('MediaClient')
    private readonly mediaClient: MediaClient,
  ) {}

  async getLabDetail(lessonId: string, mode: string) {
    const [lab, resourcesResponse] = await Promise.all([
      this.labRepository.getLabDetail(lessonId),
      this.mediaClient.getResorcesByLessonId(lessonId),
    ]);

    return {
      ...lab,
      long_description: lab.tutorial_instructions,
      resources: resourcesResponse?.data ?? [],
    };
  }

  async startLab(lessonId: string, mode: string, userId: string) {
    if (!userId) throw new BadRequestException('Missing x-user-id header');

    const labMode = mode as LabMode;
    if (!['tutorial', 'challenge'].includes(labMode)) {
      throw new BadRequestException('Mode must be tutorial or challenge');
    }

    // 1. Lấy lab
    const lab = await this.prisma.lab.findUnique({
      where: { lesson_id: BigInt(lessonId) },
    });
    if (!lab) throw new NotFoundException('Lab not found');

    // 2. Lấy account available — atomic update tránh race condition
    const account = await this.prisma.$queryRaw<
      { id: bigint; account_id: string; role_arn: string }[]
    >`
      UPDATE lab_service."LabAccount"
      SET status = 'in_use'
      WHERE id = (
        SELECT id FROM lab_service."LabAccount"
        WHERE status = 'available'
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, account_id, role_arn
    `;

    if (!account.length) {
      throw new BadRequestException(
        'No available lab accounts. Please try again later.',
      );
    }

    const { account_id, role_arn } = account[0];

    // 3. Assume role → lấy credentials
    const credentials = await this.aws.assumeLabRole(
      role_arn,
      lab.lab_type,
      userId,
    );

    // 4. Tính expires_at
    const durationMins =
      labMode === 'tutorial'
        ? lab.tutorial_duration_mins
        : lab.challenge_duration_mins;

    const expiresAt = new Date(Date.now() + durationMins * 60 * 1000);

    // 5. Tạo session
    const session = await this.prisma.labSession.create({
      data: {
        lab_id: lab.id,
        user_id: userId,
        mode: labMode,
        status: 'ready',
        aws_account_id: account_id,
        aws_role_arn: role_arn,
        aws_session_name: credentials.sessionName,
        expires_at: expiresAt,
      },
    });

    // 6. Gán session vào account
    await this.prisma.labAccount.update({
      where: { account_id },
      data: { assigned_session_id: session.id },
    });

    // 7. Lấy console URL
    const consoleUrl = await this.aws.getFederatedConsoleUrl(
      credentials,
      lab.lab_type,
    );

    return {
      session_id: session.id.toString(),
      console_url: consoleUrl,
      expires_at: expiresAt,
      mode: labMode,
      lab_type: lab.lab_type,
    };
  }
}
