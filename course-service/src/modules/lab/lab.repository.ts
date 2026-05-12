import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class LabRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getLabSessionByUserIdAndLeaseTemplateId(userId: string, leaseTemplateId: string, pageSize: number) {
    const labSessions = await this.prisma.labSession.findMany({
      where: {
        user_id: userId,
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

  async createLabSession(userId: string, leaseId: string, labId: string) {
    const labSession = await this.prisma.labSession.create({
      data: {
        user_id: userId,
        lab_id: BigInt(labId),
        lease_id: leaseId
      }
    })
    return labSession
  }

  async getLabSessionWithLab(userId: string, labId: bigint) {
    return this.prisma.labSession.findUnique({
      where: {
        lab_id_user_id: {
          lab_id: labId,
          user_id: userId
        }
      },
      include: {
        lab: {
          select: {
            IAMRoleName: true
          }
        }
      }
    })
  }
}
