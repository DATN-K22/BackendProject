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

  async getLabSessionWithLab(userId: string, leaseId: string, chapterItemId: string) {
    return this.prisma.labSession.findFirst({
      where: {
        user_id: userId,
        lease_id: leaseId,
        lab: {
          chapterItem: {
            id: BigInt(chapterItemId)
          }
        }
      },
      include: {
        lab: {
          select: {
            id: true,
            IAMRoleName: true
          }
        }
      }
    })
  }

  async getLabByLeaseId(leaseId: string) {
    return this.prisma.lab.findFirst({
      where: {
        labSessions: {
          some: {
            lease_id: leaseId
          }
        }
      }
    })
  }
}
