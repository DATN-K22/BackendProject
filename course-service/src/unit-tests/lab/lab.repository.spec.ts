import { Test, TestingModule } from '@nestjs/testing'
import { LabRepository } from '../../modules/lab/lab.repository'
import { PrismaService } from '../../prisma/prisma.service'

const mockPrisma = {
  labSession: {
    findMany: jest.fn(),
    findUnique: jest.fn()
  }
}

describe('LabRepository', () => {
  let repository: LabRepository

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabRepository,
        {
          provide: PrismaService,
          useValue: mockPrisma
        }
      ]
    }).compile()

    repository = module.get<LabRepository>(LabRepository)
    jest.clearAllMocks()
  })

  describe('getLabSessionByUserIdAndLeaseTemplateId', () => {
    it('should query lab sessions by user and template with page size', async () => {
      const sessions = [{ id: 1n, lease_id: 'lease-1' }]
      mockPrisma.labSession.findMany.mockResolvedValue(sessions)

      const result = await repository.getLabSessionByUserIdAndLeaseTemplateId('user-1', 'template-1', 5)

      expect(mockPrisma.labSession.findMany).toHaveBeenCalledWith({
        where: {
          user_id: 'user-1',
          lab: {
            leaseTemplateId: 'template-1'
          }
        },
        include: {
          lab: true
        },
        orderBy: {
          started_at: 'desc'
        },
        take: 5
      })
      expect(result).toEqual(sessions)
    })

    it('should propagate prisma errors', async () => {
      mockPrisma.labSession.findMany.mockRejectedValue(new Error('database unavailable'))

      await expect(repository.getLabSessionByUserIdAndLeaseTemplateId('user-1', 'template-1', 5)).rejects.toThrow(
        'database unavailable'
      )
    })
  })

  describe('getLabSessionWithLab', () => {
    it('should query a lab session by composite key and include IAM role name', async () => {
      const session = {
        lease_id: 'lease-1',
        lab: {
          IAMRoleName: 'LabRole'
        }
      }
      mockPrisma.labSession.findUnique.mockResolvedValue(session)

      const result = await repository.getLabSessionWithLab('user-1', BigInt(42))

      expect(mockPrisma.labSession.findUnique).toHaveBeenCalledWith({
        where: {
          lab_id_user_id: {
            lab_id: BigInt(42),
            user_id: 'user-1'
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
      expect(result).toEqual(session)
    })

    it('should propagate prisma errors from findUnique', async () => {
      mockPrisma.labSession.findUnique.mockRejectedValue(new Error('database unavailable'))

      await expect(repository.getLabSessionWithLab('user-1', BigInt(42))).rejects.toThrow('database unavailable')
    })
  })
})
