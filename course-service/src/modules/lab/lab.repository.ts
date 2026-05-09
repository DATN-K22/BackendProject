import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class LabRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getLabSessionByUserIdAndLeaseTemplateId(userId: string, leaseTemplateId: string, pageSize: number) {
    const labSessions = await this.prisma.labSession.findMany({
      where: {
        user_email: userId,
        lab: {
          leaseTemplateId
        }
      },
      include: {
        lab: true
      },
      orderBy: {
        started_at: 'desc'
      },
      take: pageSize
    })
    return labSessions
  }
}
