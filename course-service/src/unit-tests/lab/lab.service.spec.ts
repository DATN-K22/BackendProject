import { BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { LabService } from '../../modules/lab/lab.service'
import { LabRepository } from '../../modules/lab/lab.repository'
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts'
jest.mock('@aws-sdk/client-sts', () => {
  class AssumeRoleCommand {
    input: any

    constructor(input: any) {
      this.input = input
    }
  }

  return {
    STSClient: jest.fn().mockImplementation(() => ({
      send: jest.fn()
    })),

    AssumeRoleCommand
  }
})
jest.mock('@aws-sdk/client-iam', () => {
  class PutRolePolicyCommand {
    input: any

    constructor(input: any) {
      this.input = input
    }
  }

  return {
    IAMClient: jest.fn().mockImplementation(() => ({
      send: jest.fn()
    })),
    PutRolePolicyCommand
  }
})
const mockLabRepository = {
  getLabSessionByUserIdAndLeaseTemplateId: jest.fn(),
  getLabSessionWithLab: jest.fn(),
  createLabSession: jest.fn()
}

const mockJwtService = {
  signAsync: jest.fn()
}

const mockConfigService = {
  get: jest.fn(),
  getOrThrow: jest.fn()
}

const mockAwsSecret = {
  getSecret: jest.fn()
}

const mockIsbClient = {
  findLeaseById: jest.fn(),
  startSession: jest.fn(),
  findLeasesByUserEmail: jest.fn(),
  terminateLease: jest.fn()
}

const mockStsClient = {
  send: jest.fn()
}

describe('LabService', () => {
  let service: LabService

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {})
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})

    mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'AWS_REGION') return 'us-east-1'
      if (key === 'LEASE_MAX_DURATION_HOURS') return 12
      return defaultValue
    })
    mockConfigService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'LAB_USER_EMAIL') return 'lab.user@example.com'
      if (key === 'JWT_SECRET_NAME') return 'lab-jwt-secret'
      return key
    })
    mockAwsSecret.getSecret.mockResolvedValue('secret-value')
    mockJwtService.signAsync.mockResolvedValue('signed-token')

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabService,
        { provide: LabRepository, useValue: mockLabRepository },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'SECRET_MANAGEMENT_SERVICE', useValue: mockAwsSecret },
        { provide: 'IsbClient', useValue: mockIsbClient }
      ]
    }).compile()

    service = module.get<LabService>(LabService)
    jest.clearAllMocks()

    mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'AWS_REGION') return 'us-east-1'
      if (key === 'LEASE_MAX_DURATION_HOURS') return 12
      return defaultValue
    })
    mockConfigService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'LAB_USER_EMAIL') return 'lab.user@example.com'
      if (key === 'JWT_SECRET_NAME') return 'lab-jwt-secret'
      return key
    })
    mockAwsSecret.getSecret.mockResolvedValue('secret-value')
    mockJwtService.signAsync.mockResolvedValue('signed-token')
  })

  describe('generateLabToken', () => {
    it('should sign internal lab token with configured secret', async () => {
      const result = await service.generateLabToken()

      expect(mockConfigService.getOrThrow).toHaveBeenCalledWith('JWT_SECRET_NAME')
      expect(mockAwsSecret.getSecret).toHaveBeenCalledWith('lab-jwt-secret')
      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        {
          user: {
            displayName: '',
            userName: 'lab.user',
            email: 'lab.user@example.com',
            roles: ['Admin']
          }
        },
        { secret: 'secret-value', expiresIn: '1h' }
      )
      expect(result).toEqual({ access_token: 'signed-token' })
    })
  })

  describe('getLeaseById', () => {
    it('should return lease data from isb client', async () => {
      const lease = { leaseId: 'lease-1' }
      mockIsbClient.findLeaseById.mockResolvedValue({ data: lease })

      const result = await service.getLeaseById('lease-1')

      expect(mockIsbClient.findLeaseById).toHaveBeenCalledWith('lease-1', 'signed-token')
      expect(result).toEqual(lease)
    })

    it('should wrap errors from isb client', async () => {
      mockIsbClient.findLeaseById.mockRejectedValue(new Error('network error'))

      await expect(service.getLeaseById('lease-1')).rejects.toThrow(InternalServerErrorException)
    })
  })

  describe('startLab', () => {
    it('should start a session and add encoded leaseId', async () => {
      mockIsbClient.startSession.mockResolvedValue({
        data: {
          uuid: 'lab-uuid-1',
          status: 'running'
        }
      })

      const result = await service.startLab({ labId: '42', leaseTemplateUuid: 'template-1', userId: 'user-1' })

      expect(mockIsbClient.startSession).toHaveBeenCalledWith(
        'template-1',
        'user-1',
        'lab.user@example.com',
        'signed-token'
      )
      expect(result).toEqual({
        uuid: 'lab-uuid-1',
        status: 'running',
        leaseId: Buffer.from(
          JSON.stringify({ uuid: 'lab-uuid-1', userEmail: 'lab.user@example.com' }),
          'utf8'
        ).toString('base64')
      })
    })
  })

  describe('terminateLab', () => {
    it('should terminate a lab session and revoke AWS access', async () => {
      mockLabRepository.getLabSessionWithLab.mockResolvedValue({
        lease_id: 'lease-db-1',
        lab: {
          IAMRoleName: 'LabRole'
        }
      })
      mockIsbClient.terminateLease.mockResolvedValue({})
      jest.spyOn(service, 'generateLabToken').mockResolvedValue({ access_token: 'signed-token' } as any)
      jest.spyOn(service, 'getLeaseById').mockResolvedValue({ awsAccountId: '123456789012' } as any)
      jest.spyOn(service as any, 'revokeActiveSession').mockResolvedValue(undefined)

      const result = await service.terminateLab('lease-1', { userId: 'user-1', labId: '42' })

      expect(mockLabRepository.getLabSessionWithLab).toHaveBeenCalledWith('user-1', BigInt(42))
      expect(mockIsbClient.terminateLease).toHaveBeenCalledWith('lease-1', 'signed-token')
      expect((service as any).revokeActiveSession).toHaveBeenCalledWith('123456789012', 'LabRole')
      expect(result).toEqual({ leaseId: 'lease-db-1' })
    })

    it('should throw BadRequestException when lab session is not found', async () => {
      mockLabRepository.getLabSessionWithLab.mockResolvedValue(null)

      await expect(service.terminateLab('lease-1', { userId: 'user-1', labId: '42' })).rejects.toThrow(
        BadRequestException
      )
      expect(mockIsbClient.terminateLease).not.toHaveBeenCalled()
    })

    it('should throw BadRequestException when IAMRoleName is missing', async () => {
      mockLabRepository.getLabSessionWithLab.mockResolvedValue({
        lease_id: 'lease-db-1',
        lab: {
          IAMRoleName: ''
        }
      })

      await expect(service.terminateLab('lease-1', { userId: 'user-1', labId: '42' })).rejects.toThrow(
        BadRequestException
      )
      expect(mockIsbClient.terminateLease).not.toHaveBeenCalled()
    })

    it('should throw BadRequestException when awsAccountId cannot be resolved', async () => {
      mockLabRepository.getLabSessionWithLab.mockResolvedValue({
        lease_id: 'lease-db-1',
        lab: {
          IAMRoleName: 'LabRole'
        }
      })
      jest.spyOn(service, 'generateLabToken').mockResolvedValue({ access_token: 'signed-token' } as any)
      jest.spyOn(service, 'getLeaseById').mockResolvedValue({} as any)

      await expect(service.terminateLab('lease-1', { userId: 'user-1', labId: '42' })).rejects.toThrow(
        BadRequestException
      )
      expect(mockIsbClient.terminateLease).not.toHaveBeenCalled()
    })

    it('should wrap ISB terminate errors as internal server error', async () => {
      mockLabRepository.getLabSessionWithLab.mockResolvedValue({
        lease_id: 'lease-db-1',
        lab: {
          IAMRoleName: 'LabRole'
        }
      })
      jest.spyOn(service, 'generateLabToken').mockResolvedValue({ access_token: 'signed-token' } as any)
      jest.spyOn(service, 'getLeaseById').mockResolvedValue({ awsAccountId: '123456789012' } as any)
      mockIsbClient.terminateLease.mockRejectedValue(new Error('network error'))

      await expect(service.terminateLab('lease-1', { userId: 'user-1', labId: '42' })).rejects.toThrow(
        InternalServerErrorException
      )
    })
  })

  describe('getLabHistory', () => {
    it('should filter, sort, and paginate leases that belong to the user', async () => {
      mockLabRepository.getLabSessionByUserIdAndLeaseTemplateId.mockResolvedValue([
        { lease_id: 'lease-1' },
        { lease_id: 'lease-2' }
      ])
      mockIsbClient.findLeasesByUserEmail.mockResolvedValue({
        data: {
          result: [
            {
              leaseId: 'lease-2',
              comments: 'user-1',
              meta: { createdTime: '2024-01-02T00:00:00Z' }
            },
            {
              leaseId: 'lease-1',
              comments: 'user-1',
              meta: { createdTime: '2024-01-01T00:00:00Z' }
            },
            {
              leaseId: 'lease-1',
              comments: 'other-user',
              meta: { createdTime: '2024-01-03T00:00:00Z' }
            }
          ]
        }
      })

      jest.spyOn(service, 'generateLabToken').mockResolvedValue({ access_token: 'signed-token' } as any)

      const result = await service.getLabHistory('user-1', 'template-1', 1)

      expect(mockLabRepository.getLabSessionByUserIdAndLeaseTemplateId).toHaveBeenCalledWith('user-1', 'template-1', 1)
      expect(mockIsbClient.findLeasesByUserEmail).toHaveBeenCalledWith('lab.user@example.com', 'signed-token')
      expect(result).toEqual({
        result: [
          {
            leaseId: 'lease-2',
            comments: 'user-1',
            meta: { createdTime: '2024-01-02T00:00:00Z' }
          }
        ],
        nextPageIdentifier: null
      })
    })

    it('should return empty history when isb client fails', async () => {
      mockLabRepository.getLabSessionByUserIdAndLeaseTemplateId.mockResolvedValue([{ lease_id: 'lease-1' }])
      jest.spyOn(service, 'generateLabToken').mockResolvedValue({ access_token: 'signed-token' } as any)
      mockIsbClient.findLeasesByUserEmail.mockRejectedValue(new Error('service unavailable'))

      const result = await service.getLabHistory('user-1', 'template-1', 10)

      expect(result).toEqual({
        result: [],
        nextPageIdentifier: null
      })
    })
  })

  describe('getConsoleUrl', () => {
    it('should build console url response from mocked internal steps', async () => {
      const lease = {
        uuid: 'lease-1',
        awsAccountId: '123456789012',
        expirationDate: '2026-01-01T00:00:00Z',
        leaseDurationInHours: 2
      }

      ;(service as any).validateLease = jest.fn()
      ;(service as any).resolveIamConfig = jest.fn().mockResolvedValue({
        roleArn: 'arn:aws:iam::123456789012:role/LabRole',
        sessionPolicy: undefined
      })
      ;(service as any).assumeRole = jest.fn().mockResolvedValue({
        AccessKeyId: 'AKIA123',
        SecretAccessKey: 'SECRET123',
        SessionToken: 'TOKEN123',
        Expiration: new Date('2026-01-01T01:00:00Z')
      })
      ;(service as any).calculateSessionDuration = jest.fn().mockReturnValue(7200)
      ;(service as any).generateConsoleUrl = jest
        .fn()
        .mockResolvedValue('https://signin.aws.amazon.com/federation?console')

      const result = await service.getConsoleUrl(lease as any)

      expect(result).toEqual({
        consoleUrl: 'https://signin.aws.amazon.com/federation?console',
        credentials: {
          accessKeyId: 'AKIA123',
          secretAccessKey: 'SECRET123',
          sessionToken: 'TOKEN123',
          expiration: '2026-01-01T01:00:00.000Z'
        }
      })
    })

    it('should wrap validation errors into internal server error', async () => {
      ;(service as any).validateLease = jest.fn(() => {
        throw new BadRequestException('Invalid lease: missing uuid or awsAccountId')
      })

      await expect(
        service.getConsoleUrl({
          uuid: '',
          awsAccountId: '',
          expirationDate: '2026-01-01T00:00:00Z'
        } as any)
      ).rejects.toThrow(InternalServerErrorException)
    })
  })

  describe('LabService - additional coverage', () => {
    let service: LabService

    const setupModule = async (configOverrides: Record<string, unknown> = {}) => {
      jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {})
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
      ;(STSClient as jest.Mock).mockImplementation(() => mockStsClient)

      mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
        if (key in configOverrides) return configOverrides[key]
        if (key === 'AWS_REGION') return 'us-east-1'
        if (key === 'LEASE_MAX_DURATION_HOURS') return 12
        return defaultValue
      })
      mockConfigService.getOrThrow.mockImplementation((key: string) => {
        if (key === 'LAB_USER_EMAIL') return 'lab.user@example.com'
        if (key === 'JWT_SECRET_NAME') return 'lab-jwt-secret'
        return key
      })
      mockAwsSecret.getSecret.mockResolvedValue('secret-value')
      mockJwtService.signAsync.mockResolvedValue('signed-token')

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LabService,
          { provide: LabRepository, useValue: mockLabRepository },
          { provide: JwtService, useValue: mockJwtService },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: 'SECRET_MANAGEMENT_SERVICE', useValue: mockAwsSecret },
          { provide: 'IsbClient', useValue: mockIsbClient }
        ]
      }).compile()

      service = module.get<LabService>(LabService)
      jest.clearAllMocks()

      mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
        if (key in configOverrides) return configOverrides[key]
        if (key === 'AWS_REGION') return 'us-east-1'
        if (key === 'LEASE_MAX_DURATION_HOURS') return 12
        return defaultValue
      })
      mockConfigService.getOrThrow.mockImplementation((key: string) => {
        if (key === 'LAB_USER_EMAIL') return 'lab.user@example.com'
        if (key === 'JWT_SECRET_NAME') return 'lab-jwt-secret'
        return key
      })
      mockAwsSecret.getSecret.mockResolvedValue('secret-value')
      mockJwtService.signAsync.mockResolvedValue('signed-token')
    }

    beforeEach(async () => {
      await setupModule()
    })

    afterEach(() => {
      jest.clearAllMocks()
    })

    // ============================================================
    // initializeAwsClients — error path (line ~96)
    // ============================================================
    describe('initializeAwsClients error path', () => {
      it('should throw if STSClient constructor throws', async () => {
        ;(STSClient as jest.Mock).mockImplementationOnce(() => {
          throw new Error('STS init failed')
        })

        await expect(
          Test.createTestingModule({
            providers: [
              LabService,
              { provide: LabRepository, useValue: mockLabRepository },
              { provide: JwtService, useValue: mockJwtService },
              { provide: ConfigService, useValue: mockConfigService },
              { provide: 'SECRET_MANAGEMENT_SERVICE', useValue: mockAwsSecret },
              { provide: 'IsbClient', useValue: mockIsbClient }
            ]
          }).compile()
        ).rejects.toThrow('STS init failed')
      })
    })

    // ============================================================
    // validateLease — private, tested via getConsoleUrl
    // ============================================================
    describe('validateLease (via getConsoleUrl)', () => {
      it('should throw InternalServerErrorException when uuid is missing', async () => {
        await expect(
          service.getConsoleUrl({
            uuid: '',
            awsAccountId: '123456789012',
            expirationDate: new Date(Date.now() + 3600_000).toISOString()
          } as any)
        ).rejects.toThrow(InternalServerErrorException)
      })

      it('should throw InternalServerErrorException when awsAccountId is missing', async () => {
        await expect(
          service.getConsoleUrl({
            uuid: 'lease-1',
            awsAccountId: '',
            expirationDate: new Date(Date.now() + 3600_000).toISOString()
          } as any)
        ).rejects.toThrow(InternalServerErrorException)
      })

      it('should throw InternalServerErrorException when expirationDate is missing', async () => {
        await expect(
          service.getConsoleUrl({
            uuid: 'lease-1',
            awsAccountId: '123456789012',
            expirationDate: ''
          } as any)
        ).rejects.toThrow(InternalServerErrorException)
      })

      it('should throw InternalServerErrorException when lease is already expired', async () => {
        await expect(
          service.getConsoleUrl({
            uuid: 'lease-1',
            awsAccountId: '123456789012',
            expirationDate: new Date(Date.now() - 1000).toISOString()
          } as any)
        ).rejects.toThrow(InternalServerErrorException)
      })
    })

    // ============================================================
    // resolveRoleArn — private, tested via getConsoleUrl full flow
    // ============================================================
    describe('resolveRoleArn (via getConsoleUrl)', () => {
      const validLease = {
        uuid: 'lease-1',
        awsAccountId: '123456789012',
        expirationDate: new Date(Date.now() + 7200_000).toISOString(),
        leaseDurationInHours: 2
      }

      it('should throw InternalServerErrorException when no role ARN is configured', async () => {
        // Neither template role nor DEFAULT_LAB_ROLE_ARN configured
        mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'AWS_REGION') return 'us-east-1'
          if (key === 'LEASE_MAX_DURATION_HOURS') return 12
          if (key === 'DEFAULT_LAB_ROLE_ARN') return undefined
          return defaultValue
        })

        await expect(service.getConsoleUrl(validLease as any)).rejects.toThrow(InternalServerErrorException)
      })

      it('should use DEFAULT_LAB_ROLE_ARN when no template role is available', async () => {
        mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'AWS_REGION') return 'us-east-1'
          if (key === 'LEASE_MAX_DURATION_HOURS') return 12
          if (key === 'DEFAULT_LAB_ROLE_ARN') return 'arn:aws:iam::123456789012:role/DefaultRole'
          return defaultValue
        })

        mockStsClient.send.mockResolvedValue({
          Credentials: {
            AccessKeyId: 'AKIA',
            SecretAccessKey: 'SECRET',
            SessionToken: 'TOKEN',
            Expiration: new Date()
          }
        })

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          text: jest.fn().mockResolvedValue(JSON.stringify({ SigninToken: 'token-abc' }))
        }) as any

        const result = await service.getConsoleUrl(validLease as any)

        expect(result.consoleUrl).toContain('signin.aws.amazon.com')
        expect(mockStsClient.send).toHaveBeenCalledWith(expect.any(AssumeRoleCommand))
      })

      it('should build role ARN from template when originalLeaseTemplateUuid and templateRoleName are set', async () => {
        const leaseWithTemplate = {
          ...validLease,
          originalLeaseTemplateUuid: 'template-uuid-1'
        }

        mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'AWS_REGION') return 'us-east-1'
          if (key === 'LEASE_MAX_DURATION_HOURS') return 12
          if (key === '') return 'TemplateRoleName'
          if (key === 'DEFAULT_LAB_ROLE_ARN') return 'arn:aws:iam::123456789012:role/DefaultRole'
          return defaultValue
        })

        mockStsClient.send.mockResolvedValue({
          Credentials: {
            AccessKeyId: 'AKIA',
            SecretAccessKey: 'SECRET',
            SessionToken: 'TOKEN',
            Expiration: new Date()
          }
        })

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          text: jest.fn().mockResolvedValue(JSON.stringify({ SigninToken: 'token-abc' }))
        }) as any

        const result = await service.getConsoleUrl(leaseWithTemplate as any)
        expect(result.consoleUrl).toContain('signin.aws.amazon.com')
      })
    })

    // ============================================================
    // resolveSessionPolicy — private, tested via getConsoleUrl
    // ============================================================
    describe('resolveSessionPolicy (via getConsoleUrl)', () => {
      const validLease = {
        uuid: 'lease-1',
        awsAccountId: '123456789012',
        expirationDate: new Date(Date.now() + 7200_000).toISOString(),
        leaseDurationInHours: 2,
        originalLeaseTemplateUuid: 'template-uuid-1'
      }

      beforeEach(() => {
        mockStsClient.send.mockResolvedValue({
          Credentials: {
            AccessKeyId: 'AKIA',
            SecretAccessKey: 'SECRET',
            SessionToken: 'TOKEN',
            Expiration: new Date()
          }
        })

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          text: jest.fn().mockResolvedValue(JSON.stringify({ SigninToken: 'tok' }))
        }) as any
      })

      it('should attach session policy when policyId and policy are both configured', async () => {
        mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'AWS_REGION') return 'us-east-1'
          if (key === 'LEASE_MAX_DURATION_HOURS') return 12
          if (key === 'DEFAULT_LAB_ROLE_ARN') return 'arn:aws:iam::123456789012:role/DefaultRole'
          if (key === 'LEASE_TEMPLATE_template-uuid-1_SESSION_POLICY_ID') return 'policy-id-1'
          if (key === 'SESSION_POLICY_policy-id-1') return JSON.stringify({ Version: '2012-10-17', Statement: [] })
          return defaultValue
        })

        const result = await service.getConsoleUrl(validLease as any)
        expect(result.consoleUrl).toContain('signin.aws.amazon.com')

        const assumeCall = mockStsClient.send.mock.calls[0][0]
        expect(assumeCall.input.Policy).toBeDefined()
      })

      it('should not attach session policy when policyId is missing', async () => {
        mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'AWS_REGION') return 'us-east-1'
          if (key === 'LEASE_MAX_DURATION_HOURS') return 12
          if (key === 'DEFAULT_LAB_ROLE_ARN') return 'arn:aws:iam::123456789012:role/DefaultRole'
          if (key === 'LEASE_TEMPLATE_template-uuid-1_SESSION_POLICY_ID') return undefined
          return defaultValue
        })

        const result = await service.getConsoleUrl(validLease as any)
        expect(result.consoleUrl).toContain('signin.aws.amazon.com')
      })

      it('should skip session policy gracefully when resolveSessionPolicy throws', async () => {
        mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'AWS_REGION') return 'us-east-1'
          if (key === 'LEASE_MAX_DURATION_HOURS') return 12
          if (key === 'DEFAULT_LAB_ROLE_ARN') return 'arn:aws:iam::123456789012:role/DefaultRole'
          if (key === 'LEASE_TEMPLATE_template-uuid-1_SESSION_POLICY_ID') return 'policy-id-1'
          if (key === 'SESSION_POLICY_policy-id-1') {
            throw new Error('config read error')
          }
          return defaultValue
        })

        const result = await service.getConsoleUrl(validLease as any)
        expect(result.consoleUrl).toContain('signin.aws.amazon.com')
      })

      it('should throw BadRequestException through InternalServerError when policy JSON is invalid', async () => {
        mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'AWS_REGION') return 'us-east-1'
          if (key === 'LEASE_MAX_DURATION_HOURS') return 12
          if (key === 'DEFAULT_LAB_ROLE_ARN') return 'arn:aws:iam::123456789012:role/DefaultRole'
          if (key === 'LEASE_TEMPLATE_template-uuid-1_SESSION_POLICY_ID') return 'policy-id-1'
          if (key === 'SESSION_POLICY_policy-id-1') return 'invalid-json{'
          return defaultValue
        })

        await expect(service.getConsoleUrl(validLease as any)).rejects.toThrow(InternalServerErrorException)
      })
    })

    // ============================================================
    // buildRoleArn — private, tested directly via casting
    // ============================================================
    describe('buildRoleArn (direct private access)', () => {
      it('should return valid ARN for given accountId and roleName', () => {
        const arn = (service as any).buildRoleArn('123456789012', 'MyRole')
        expect(arn).toBe('arn:aws:iam::123456789012:role/MyRole')
      })

      it('should throw BadRequestException when accountId is empty', () => {
        expect(() => (service as any).buildRoleArn('', 'MyRole')).toThrow(BadRequestException)
      })

      it('should throw BadRequestException when roleName is empty', () => {
        expect(() => (service as any).buildRoleArn('123456789012', '')).toThrow(BadRequestException)
      })
    })

    // ============================================================
    // normalizeSessionPolicy — private, tested directly
    // ============================================================
    describe('normalizeSessionPolicy (direct private access)', () => {
      it('should return undefined when policy is undefined', () => {
        expect((service as any).normalizeSessionPolicy(undefined)).toBeUndefined()
      })

      it('should return undefined when policy is empty string', () => {
        expect((service as any).normalizeSessionPolicy('')).toBeUndefined()
      })

      it('should normalize valid JSON policy', () => {
        const policy = '{ "Version": "2012-10-17", "Statement": [] }'
        const result = (service as any).normalizeSessionPolicy(policy)
        expect(result).toBe(JSON.stringify(JSON.parse(policy)))
      })

      it('should throw BadRequestException for malformed JSON', () => {
        expect(() => (service as any).normalizeSessionPolicy('{invalid')).toThrow(BadRequestException)
      })
    })

    // ============================================================
    // calculateSessionDuration — private, tested directly
    // ============================================================
    describe('calculateSessionDuration (direct private access)', () => {
      it('should return lease duration when it is less than max', () => {
        const lease = { leaseDurationInHours: 2, expirationDate: new Date(Date.now() + 7200_000).toISOString() }
        // LEASE_MAX_DURATION_HOURS = 12 (default), lease = 2h → expect 2 * 3600 = 7200
        const duration = (service as any).calculateSessionDuration(lease)
        expect(duration).toBe(7200)
      })

      it('should cap at max duration when lease duration exceeds max', () => {
        mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'LEASE_MAX_DURATION_HOURS') return 1
          return defaultValue
        })
        const lease = { leaseDurationInHours: 10 }
        const duration = (service as any).calculateSessionDuration(lease)
        expect(duration).toBe(3600) // capped at 1h = 3600s
      })

      it('should default leaseDurationInHours to 1 when not provided', () => {
        const lease = {}
        const duration = (service as any).calculateSessionDuration(lease)
        expect(duration).toBe(3600) // 1h default
      })
    })

    // ============================================================
    // assumeRole — private, tested directly
    // ============================================================
    describe('assumeRole (direct private access)', () => {
      const iamConfig = { roleArn: 'arn:aws:iam::123456789012:role/MyRole' }
      const validLease = {
        uuid: 'lease-1',
        expirationDate: new Date(Date.now() + 7200_000).toISOString()
      }

      it('should return credentials on successful assume role', async () => {
        const mockCredentials = {
          AccessKeyId: 'AKIA123',
          SecretAccessKey: 'SECRET',
          SessionToken: 'TOKEN',
          Expiration: new Date()
        }
        mockStsClient.send.mockResolvedValue({ Credentials: mockCredentials })

        const result = await (service as any).assumeRole(iamConfig, validLease)

        expect(result).toEqual(mockCredentials)
        expect(mockStsClient.send).toHaveBeenCalledWith(expect.any(AssumeRoleCommand))
      })

      it('should include session policy in assume role when provided and non-empty', async () => {
        mockStsClient.send.mockResolvedValue({
          Credentials: { AccessKeyId: 'A', SecretAccessKey: 'B', SessionToken: 'C', Expiration: new Date() }
        })

        await (service as any).assumeRole(
          { roleArn: 'arn:aws:iam::123456789012:role/MyRole', sessionPolicy: '{"Version":"2012-10-17"}' },
          validLease
        )

        const command = mockStsClient.send.mock.calls[0][0]
        expect(command.input.Policy).toBe('{"Version":"2012-10-17"}')
      })

      it('should not include Policy when sessionPolicy is empty/whitespace', async () => {
        mockStsClient.send.mockResolvedValue({
          Credentials: { AccessKeyId: 'A', SecretAccessKey: 'B', SessionToken: 'C', Expiration: new Date() }
        })

        await (service as any).assumeRole({ roleArn: iamConfig.roleArn, sessionPolicy: '   ' }, validLease)

        const command = mockStsClient.send.mock.calls[0][0]
        expect(command.input.Policy).toBeUndefined()
      })

      it('should throw InternalServerErrorException when credentials are missing in response', async () => {
        mockStsClient.send.mockResolvedValue({ Credentials: null })

        await expect((service as any).assumeRole(iamConfig, validLease)).rejects.toThrow(InternalServerErrorException)
      })

      it('should re-throw STS errors', async () => {
        mockStsClient.send.mockRejectedValue(new Error('AccessDenied'))

        await expect((service as any).assumeRole(iamConfig, validLease)).rejects.toThrow('AccessDenied')
      })

      it('should cap DurationSeconds at 12 hours even when lease has more time remaining', async () => {
        mockStsClient.send.mockResolvedValue({
          Credentials: { AccessKeyId: 'A', SecretAccessKey: 'B', SessionToken: 'C', Expiration: new Date() }
        })

        const longLease = {
          uuid: 'lease-long',
          expirationDate: new Date(Date.now() + 48 * 3600_000).toISOString()
        }

        await (service as any).assumeRole(iamConfig, longLease)

        const command = mockStsClient.send.mock.calls[0][0]
        expect(command.input.DurationSeconds).toBe(12 * 3600)
      })
    })

    // ============================================================
    // generateConsoleUrl — private, tested directly
    // ============================================================
    describe('generateConsoleUrl (direct private access)', () => {
      const credentials = {
        AccessKeyId: 'AKIA123',
        SecretAccessKey: 'SECRET',
        SessionToken: 'TOKEN'
      }

      it('should return a valid federation console URL', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          text: jest.fn().mockResolvedValue(JSON.stringify({ SigninToken: 'my-signin-token' }))
        }) as any

        const url = await (service as any).generateConsoleUrl(credentials, 3600)

        expect(url).toContain('https://signin.aws.amazon.com/federation')
        expect(url).toContain('Action=login')
        expect(url).toContain('SigninToken=my-signin-token')
        expect(url).toContain('Destination=')
      })

      it('should throw InternalServerErrorException when federation returns non-ok status', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 403,
          text: jest.fn().mockResolvedValue('Forbidden')
        }) as any

        await expect((service as any).generateConsoleUrl(credentials, 3600)).rejects.toThrow(
          InternalServerErrorException
        )
      })

      it('should throw InternalServerErrorException when response JSON is invalid', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          text: jest.fn().mockResolvedValue('not-json{{{')
        }) as any

        await expect((service as any).generateConsoleUrl(credentials, 3600)).rejects.toThrow(
          InternalServerErrorException
        )
      })

      it('should throw InternalServerErrorException when SigninToken is missing in response', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          text: jest.fn().mockResolvedValue(JSON.stringify({ something: 'else' }))
        }) as any

        await expect((service as any).generateConsoleUrl(credentials, 3600)).rejects.toThrow(
          InternalServerErrorException
        )
      })

      it('should throw InternalServerErrorException on unexpected fetch error', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('network failure')) as any

        await expect((service as any).generateConsoleUrl(credentials, 3600)).rejects.toThrow(
          InternalServerErrorException
        )
      })

      it('should re-throw InternalServerErrorException without wrapping again', async () => {
        global.fetch = jest.fn().mockRejectedValue(new InternalServerErrorException('already wrapped')) as any

        await expect((service as any).generateConsoleUrl(credentials, 3600)).rejects.toThrow(
          InternalServerErrorException
        )
      })
    })

    // ============================================================
    // base64EncodeCompositeKey — private, tested directly
    // ============================================================
    describe('base64EncodeCompositeKey (direct private access)', () => {
      it('should return null when key is undefined', () => {
        expect((service as any).base64EncodeCompositeKey(undefined)).toBeNull()
      })

      it('should return base64-encoded JSON string for a given object', () => {
        const key = { uuid: 'abc', userEmail: 'x@y.com' }
        const result = (service as any).base64EncodeCompositeKey(key)
        expect(result).toBe(Buffer.from(JSON.stringify(key), 'utf8').toString('base64'))
      })
    })

    // ============================================================
    // startLab — error path
    // ============================================================
    describe('startLab error path', () => {
      it('should throw InternalServerErrorException when isbClient.startSession fails', async () => {
        mockIsbClient.startSession.mockRejectedValue(new Error('session error'))

        await expect(
          service.startLab({ labId: '42', leaseTemplateUuid: 'template-1', userId: 'user-1' })
        ).rejects.toThrow(InternalServerErrorException)
      })
    })

    // ============================================================
    // getLabHistory — pagination slice
    // ============================================================
    describe('getLabHistory pagination', () => {
      it('should slice result to pageSize', async () => {
        mockLabRepository.getLabSessionByUserIdAndLeaseTemplateId.mockResolvedValue([
          { lease_id: 'lease-1' },
          { lease_id: 'lease-2' },
          { lease_id: 'lease-3' }
        ])

        mockIsbClient.findLeasesByUserEmail.mockResolvedValue({
          data: {
            result: [
              { leaseId: 'lease-3', comments: 'user-1', meta: { createdTime: '2024-01-03T00:00:00Z' } },
              { leaseId: 'lease-2', comments: 'user-1', meta: { createdTime: '2024-01-02T00:00:00Z' } },
              { leaseId: 'lease-1', comments: 'user-1', meta: { createdTime: '2024-01-01T00:00:00Z' } }
            ]
          }
        })

        jest.spyOn(service, 'generateLabToken').mockResolvedValue({ access_token: 'signed-token' } as any)

        const result = await service.getLabHistory('user-1', 'template-1', 2)

        expect(result.result).toHaveLength(2)
        // Should be sorted desc by createdTime, capped to pageSize=2
        expect(result.result[0].leaseId).toBe('lease-3')
        expect(result.result[1].leaseId).toBe('lease-2')
      })

      it('should return empty result when data.result is null/undefined', async () => {
        mockLabRepository.getLabSessionByUserIdAndLeaseTemplateId.mockResolvedValue([])
        mockIsbClient.findLeasesByUserEmail.mockResolvedValue({ data: {} })

        jest.spyOn(service, 'generateLabToken').mockResolvedValue({ access_token: 'signed-token' } as any)

        const result = await service.getLabHistory('user-1', 'template-1', 10)
        expect(result.result).toEqual([])
      })
    })
  })
})
