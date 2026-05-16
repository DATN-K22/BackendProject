import { Injectable, Logger } from '@nestjs/common'
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

  async getLabByChapterItemId(chapterItemId: string) {
    return this.prisma.lab.findFirst({
      where: { chapterItem: { id: BigInt(chapterItemId) } }
    })
  }

  async createLabSession(userId: string, leaseId: string, labId: bigint) {
    const labSession = await this.prisma.labSession.create({
      data: {
        user_id: userId,
        lab_id: labId,
        lease_id: leaseId
      }
    })
    return labSession
  }

  async updateLabSessionLeaseId(sessionId: bigint, leaseId: string) {
    return this.prisma.labSession.update({
      where: { id: sessionId },
      data: { lease_id: leaseId }
    })
  }

  async deleteLabSession(sessionId: bigint) {
    return this.prisma.labSession.delete({
      where: { id: sessionId }
    })
  }

  async getLabSessionWithLab(userId: string, labId: bigint, leaseId: string) {
    return this.prisma.labSession.findUnique({
      where: {
        uq_lab_session_lab_user: {
          lab_id: labId,
          user_id: userId,
          lease_id: leaseId
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
