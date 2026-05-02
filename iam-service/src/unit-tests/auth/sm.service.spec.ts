// src/unit-tests/auth/aws-secret.service.spec.ts

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => ({ input }))
}))

import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { AwsSecretService } from '../../modules/auth/sm.service'

// ─── Mock ConfigService ───────────────────────────────────────────────────────

const mockConfigService = {
  getOrThrow: jest.fn((key: string) => {
    const config: Record<string, string> = {
      AWS_REGION: 'ap-southeast-1',
      AWS_ACCESS_KEY: 'mock-access-key',
      AWS_SECRET_KEY: 'mock-secret-key',
      JWT_SECRET_NAME: 'jwt-secret'
    }
    const value = config[key]
    if (!value) throw new Error(`Missing config: ${key}`)
    return value
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeSendMock = (secretString: string | undefined) => jest.fn().mockResolvedValue({ SecretString: secretString })

describe('AwsSecretService', () => {
  let service: AwsSecretService
  let mockSend: jest.Mock

  beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})

    mockSend = makeSendMock('{"jwt_secret":"super-secret-value"}')
    ;(SecretsManagerClient as jest.Mock).mockImplementation(() => ({ send: mockSend }))

    const module: TestingModule = await Test.createTestingModule({
      providers: [AwsSecretService, { provide: ConfigService, useValue: mockConfigService }]
    }).compile()

    service = module.get<AwsSecretService>(AwsSecretService)
    jest.clearAllMocks()

    // Re-assign send sau clearAllMocks
    mockSend = makeSendMock('{"jwt_secret":"super-secret-value"}')
    ;(service as any).client = { send: mockSend }

    // Clear cache trước mỗi test
    ;(service as any).cache.clear()
  })

  // ─── onModuleInit ──────────────────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('should warm up the JWT secret on init', async () => {
      mockSend.mockResolvedValue({ SecretString: '{"jwt_secret":"warmed-secret"}' })

      await service.onModuleInit()

      expect(mockSend).toHaveBeenCalledTimes(1)
      const cached = (service as any).cache.get('jwt-secret')
      expect(cached).toBeDefined()
      expect(cached.value).toBe('warmed-secret')
    })

    it('should propagate error when secret fetch fails during init', async () => {
      mockSend.mockRejectedValue(new Error('AWS unreachable'))

      await expect(service.onModuleInit()).rejects.toThrow('AWS unreachable')
    })
  })

  // ─── getSecret ─────────────────────────────────────────────────────────────

  describe('getSecret', () => {
    it('should fetch secret from AWS and return jwt_secret field', async () => {
      mockSend.mockResolvedValue({ SecretString: '{"jwt_secret":"my-jwt-value"}' })

      const result = await service.getSecret('jwt-secret')

      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(result).toBe('my-jwt-value')
    })

    it('should return raw SecretString when jwt_secret key is absent in JSON', async () => {
      mockSend.mockResolvedValue({ SecretString: '{"other_key":"other-value"}' })

      const result = await service.getSecret('jwt-secret')

      // jwt_secret absent → fallback to raw JSON string
      expect(result).toBe('{"other_key":"other-value"}')
    })

    it('should return raw SecretString when value is not valid JSON', async () => {
      mockSend.mockResolvedValue({ SecretString: 'plain-string-secret' })

      const result = await service.getSecret('jwt-secret')

      expect(result).toBe('plain-string-secret')
    })

    it('should throw when SecretString is empty/undefined', async () => {
      mockSend.mockResolvedValue({ SecretString: undefined })

      await expect(service.getSecret('jwt-secret')).rejects.toThrow(
        'Secret "jwt-secret" is empty or binary — not supported'
      )
    })

    it('should throw when SecretString is empty string', async () => {
      mockSend.mockResolvedValue({ SecretString: '' })

      await expect(service.getSecret('jwt-secret')).rejects.toThrow(
        'Secret "jwt-secret" is empty or binary — not supported'
      )
    })

    it('should propagate AWS SDK error', async () => {
      mockSend.mockRejectedValue(new Error('ResourceNotFoundException'))

      await expect(service.getSecret('jwt-secret')).rejects.toThrow('ResourceNotFoundException')
    })

    // ─── Cache behavior ───────────────────────────────────────────────────────

    it('should return cached value without calling AWS on second request', async () => {
      mockSend.mockResolvedValue({ SecretString: '{"jwt_secret":"cached-secret"}' })

      const first = await service.getSecret('jwt-secret')
      const second = await service.getSecret('jwt-secret')

      expect(mockSend).toHaveBeenCalledTimes(1) // chỉ gọi AWS 1 lần
      expect(first).toBe('cached-secret')
      expect(second).toBe('cached-secret')
    })

    it('should re-fetch from AWS when cache is expired', async () => {
      mockSend.mockResolvedValue({ SecretString: '{"jwt_secret":"fresh-secret"}' })

      // Seed cache với loadedAt đã hết hạn
      const expiredLoadedAt = Date.now() - 31 * 24 * 60 * 60 * 1000 // 31 ngày trước
      ;(service as any).cache.set('jwt-secret', {
        value: 'stale-secret',
        loadedAt: expiredLoadedAt
      })

      const result = await service.getSecret('jwt-secret')

      expect(mockSend).toHaveBeenCalledTimes(1) // phải gọi lại AWS
      expect(result).toBe('fresh-secret')
    })

    it('should NOT re-fetch when cache is still valid', async () => {
      // Seed cache với loadedAt hợp lệ (1 ngày trước)
      ;(service as any).cache.set('jwt-secret', {
        value: 'valid-cached-secret',
        loadedAt: Date.now() - 24 * 60 * 60 * 1000
      })

      const result = await service.getSecret('jwt-secret')

      expect(mockSend).not.toHaveBeenCalled()
      expect(result).toBe('valid-cached-secret')
    })

    it('should cache different secrets independently', async () => {
      mockSend
        .mockResolvedValueOnce({ SecretString: '{"jwt_secret":"secret-A"}' })
        .mockResolvedValueOnce({ SecretString: '{"jwt_secret":"secret-B"}' })

      const resultA = await service.getSecret('secret-A')
      const resultB = await service.getSecret('secret-B')

      expect(mockSend).toHaveBeenCalledTimes(2)
      expect(resultA).toBe('secret-A')
      expect(resultB).toBe('secret-B')
    })
  })

  // ─── invalidate ────────────────────────────────────────────────────────────

  describe('invalidate', () => {
    it('should remove secret from cache', async () => {
      // Seed cache trước
      ;(service as any).cache.set('jwt-secret', {
        value: 'cached-value',
        loadedAt: Date.now()
      })

      service.invalidate('jwt-secret')

      const cached = (service as any).cache.get('jwt-secret')
      expect(cached).toBeUndefined()
    })

    it('should force re-fetch from AWS after invalidation', async () => {
      // Seed cache
      ;(service as any).cache.set('jwt-secret', {
        value: 'old-secret',
        loadedAt: Date.now()
      })

      service.invalidate('jwt-secret')

      mockSend.mockResolvedValue({ SecretString: '{"jwt_secret":"new-secret-after-invalidate"}' })
      const result = await service.getSecret('jwt-secret')

      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(result).toBe('new-secret-after-invalidate')
    })

    it('should not throw when invalidating non-existent cache key', () => {
      expect(() => service.invalidate('nonexistent-secret')).not.toThrow()
    })

    it('should only invalidate the specified secret, not others', async () => {
      ;(service as any).cache.set('secret-A', { value: 'value-A', loadedAt: Date.now() })
      ;(service as any).cache.set('secret-B', { value: 'value-B', loadedAt: Date.now() })

      service.invalidate('secret-A')

      expect((service as any).cache.get('secret-A')).toBeUndefined()
      expect((service as any).cache.get('secret-B')).toBeDefined()
    })
  })
})
