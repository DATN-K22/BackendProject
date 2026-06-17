// src/unit-tests/auth/auth.service.spec.ts

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(),
  UserStatus: {
    active: 'active',
    pending: 'pending',
    temporary_banned: 'temporary_banned'
  }
}))

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  verify: jest.fn().mockResolvedValue(true)
}))

jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('mock-uuid') }))

jest.mock('node:crypto', () => ({
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('mock-hash')
  })
}))

import { Test, TestingModule } from '@nestjs/testing'
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { UserStatus } from '@prisma/client'
import { AuthService } from '../../modules/auth/auth.service'
import { PrismaService } from '../../prisma/prisma.service'
import { RedisBlacklistService } from '../../modules/redis/redis-blacklist.service'
import { RedisCacheService } from '../../modules/redis/redis-cache.service'
import { UserRespository } from '../../modules/user/user.repository'
import { MESSAGE_BROKER } from '../../modules/message_broker/message-broker.token'
import { AuthSignInDto, AuthSignUpDto } from '../../modules/auth/dto/auth.dto'

// ─── Shared mock user ─────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  password_hash: 'hashed_password',
  first_name: 'Test',
  last_name: 'User',
  role: 'user',
  status: UserStatus.active,
  avt_url: null
}

// ─── Mock providers ───────────────────────────────────────────────────────────

const mockPrisma = {
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn()
  }
}

const mockJwtService = {
  signAsync: jest.fn().mockResolvedValue('mock-access-token')
}

const mockConfigService = {
  get: jest.fn().mockReturnValue('3600'),
  getOrThrow: jest.fn().mockReturnValue('jwt-secret-name')
}

const mockBlacklist = { blacklistToken: jest.fn() }

const mockRedis = {
  get: jest.fn(),
  del: jest.fn(),
  set: jest.fn()
}

const mockMessageBroker = { sendMail: jest.fn() }

const mockAwsSecret = { getSecret: jest.fn().mockResolvedValue('jwt-secret-value') }

const mockUserRepository = {
  createUser: jest.fn(),
  findByEmail: jest.fn(),
  findById: jest.fn(),
  updateStatusByEmail: jest.fn(),
  updatePasswordByEmail: jest.fn()
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisBlacklistService, useValue: mockBlacklist },
        { provide: RedisCacheService, useValue: mockRedis },
        { provide: MESSAGE_BROKER, useValue: mockMessageBroker },
        { provide: 'SECRET_MANAGEMENT_SERVICE', useValue: mockAwsSecret },
        { provide: UserRespository, useValue: mockUserRepository }
      ]
    }).compile()

    service = module.get<AuthService>(AuthService)
    jest.clearAllMocks()

    // Reset về default sau mỗi test
    const argon = require('argon2')
    argon.hash.mockResolvedValue('hashed_password')
    argon.verify.mockResolvedValue(true)

    mockJwtService.signAsync.mockResolvedValue('mock-access-token')
    mockConfigService.get.mockReturnValue('3600')
    mockConfigService.getOrThrow.mockReturnValue('jwt-secret-name')
    mockAwsSecret.getSecret.mockResolvedValue('jwt-secret-value')
    mockPrisma.refreshToken.create.mockResolvedValue({})
    mockPrisma.refreshToken.update.mockResolvedValue({})
    mockPrisma.refreshToken.updateMany.mockResolvedValue({})
  })

  // ─── signup ─────────────────────────────────────────────────────────────────

  describe('signup', () => {
    const dto: AuthSignUpDto = {
      email: 'test@example.com',
      password: 'abc@123',
      first_name: 'Test',
      last_name: 'User',
      role: 'user'
    }

    it('should create user and send mail successfully', async () => {
      mockUserRepository.createUser.mockResolvedValue(undefined)
      mockMessageBroker.sendMail.mockResolvedValue(undefined)

      await service.signup(dto)

      expect(mockUserRepository.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: dto.email,
          password_hash: 'hashed_password',
          status: UserStatus.pending
        })
      )
      expect(mockMessageBroker.sendMail).toHaveBeenCalledWith(dto.email)
    })

    it('should signup with only required fields', async () => {
      const minimalDto: AuthSignUpDto = { email: 'test@example.com', password: 'abc@123' }
      mockUserRepository.createUser.mockResolvedValue(undefined)
      mockMessageBroker.sendMail.mockResolvedValue(undefined)

      await service.signup(minimalDto)

      expect(mockUserRepository.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: minimalDto.email }))
    })

    it('should throw ForbiddenException when email already exists (P2002)', async () => {
      mockUserRepository.createUser.mockRejectedValue({ code: 'P2002' })

      await expect(service.signup(dto)).rejects.toThrow('Email already exists')
    })

    it('should throw InternalServerErrorException on unknown error', async () => {
      mockUserRepository.createUser.mockRejectedValue(new Error('DB connection failed'))

      await expect(service.signup(dto)).rejects.toThrow(InternalServerErrorException)
    })
  })

  // ─── sendOtp ────────────────────────────────────────────────────────────────

  describe('sendOtp', () => {
    it('should send OTP successfully when user exists', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser)
      mockMessageBroker.sendMail.mockResolvedValue(undefined)

      await service.sendOtp('test@example.com')

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@example.com')
      expect(mockMessageBroker.sendMail).toHaveBeenCalledWith('test@example.com')
    })

    it('should throw ForbiddenException when email not found', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null)

      await expect(service.sendOtp('notfound@example.com')).rejects.toThrow(ForbiddenException)
      expect(mockMessageBroker.sendMail).not.toHaveBeenCalled()
    })
  })

  // ─── verifyOtp ──────────────────────────────────────────────────────────────

  describe('verifyOtp', () => {
    it('should verify OTP and activate user when type is not forgot_password', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser)
      mockRedis.get.mockResolvedValue('123456')
      mockRedis.del.mockResolvedValue(undefined)
      mockUserRepository.updateStatusByEmail.mockResolvedValue(undefined)

      await service.verifyOtp('test@example.com', '123456')

      expect(mockRedis.del).toHaveBeenCalledWith('otp:test@example.com')
      expect(mockUserRepository.updateStatusByEmail).toHaveBeenCalledWith('test@example.com', UserStatus.active)
    })

    it('should verify OTP but NOT activate user when type is forgot_password', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser)
      mockRedis.get.mockResolvedValue('123456')

      await service.verifyOtp('test@example.com', '123456', 'forgot_password')

      expect(mockRedis.del).not.toHaveBeenCalled()
      expect(mockUserRepository.updateStatusByEmail).not.toHaveBeenCalled()
    })

    it('should throw NotFoundException when email not found', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null)

      await expect(service.verifyOtp('x@x.com', '123456')).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException when OTP expired', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser)
      mockRedis.get.mockResolvedValue(null)

      await expect(service.verifyOtp('test@example.com', '123456')).rejects.toThrow('OTP expired')
    })

    it('should throw BadRequestException when OTP does not match', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser)
      mockRedis.get.mockResolvedValue('999999')

      await expect(service.verifyOtp('test@example.com', '123456')).rejects.toThrow('Invalid OTP')
    })
  })

  // ─── resetPassword ──────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('should reset password successfully', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser)
      mockRedis.get.mockResolvedValue('123456')
      mockUserRepository.updatePasswordByEmail.mockResolvedValue(undefined)
      mockRedis.del.mockResolvedValue(undefined)

      await service.resetPassword('test@example.com', '123456', 'newpass123')

      expect(mockUserRepository.updatePasswordByEmail).toHaveBeenCalledWith('test@example.com', 'hashed_password')
      expect(mockRedis.del).toHaveBeenCalledWith('otp:test@example.com')
    })

    it('should throw NotFoundException when user not found', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null)

      await expect(service.resetPassword('x@x.com', '123456', 'pass')).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException when OTP expired', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser)
      mockRedis.get.mockResolvedValue(null)

      await expect(service.resetPassword('test@example.com', '123456', 'pass')).rejects.toThrow('OTP expired')
    })

    it('should throw BadRequestException when OTP does not match', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser)
      mockRedis.get.mockResolvedValue('999999')

      await expect(service.resetPassword('test@example.com', '123456', 'pass')).rejects.toThrow('Invalid OTP')
    })
  })

  // ─── signin ─────────────────────────────────────────────────────────────────

  describe('signin', () => {
    const dto: AuthSignInDto = { email: 'test@example.com', password: 'abc@123' }

    it('should signin successfully and return tokens + user', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser)

      const result = await service.signin(dto)

      expect(result).toHaveProperty('tokens')
      expect(result).toHaveProperty('user')
      expect(result.tokens).toHaveProperty('access_token')
      expect(result.tokens).toHaveProperty('refresh_token')
      expect(result.user.email).toBe(mockUser.email)
    })

    it('should throw NotFoundException when user not found', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null)

      await expect(service.signin(dto)).rejects.toThrow('User not found')
    })

    it('should throw ForbiddenException when account is pending', async () => {
      mockUserRepository.findByEmail.mockResolvedValue({ ...mockUser, status: UserStatus.pending })

      await expect(service.signin(dto)).rejects.toThrow('Account not activated')
    })

    it('should throw ForbiddenException when account is temporary_banned', async () => {
      mockUserRepository.findByEmail.mockResolvedValue({
        ...mockUser,
        status: UserStatus.temporary_banned
      })

      await expect(service.signin(dto)).rejects.toThrow('temporarily banned')
    })

    it('should throw ForbiddenException when password does not match', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser)
      const argon = require('argon2')
      argon.verify.mockResolvedValueOnce(false)

      await expect(service.signin(dto)).rejects.toThrow('Credentials incorrect')
    })
  })

  // ─── refreshToken ───────────────────────────────────────────────────────────

  describe('refreshToken', () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60)

    const validTokenRecord = {
      id: 'token-1',
      user_id: 'user-1',
      token_hash: 'mock-hash',
      used: false,
      revoked: false,
      expires_at: futureDate
    }

    it('should refresh token successfully', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(validTokenRecord)
      mockUserRepository.findById.mockResolvedValue(mockUser)

      const result = await service.refreshToken('old-token')

      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(expect.objectContaining({ data: { used: true } }))
      expect(result).toHaveProperty('access_token')
      expect(result).toHaveProperty('refresh_token')
    })

    it('should throw UnauthorizedException when token not found', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null)

      await expect(service.refreshToken('invalid-token')).rejects.toThrow('Token not found')
    })

    it('should revoke all tokens and throw when token is already used (reuse detection)', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({ ...validTokenRecord, used: true })

      await expect(service.refreshToken('reused-token')).rejects.toThrow('Refresh token reuse detected')
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revoked: true } })
      )
    })

    it('should throw when token is revoked', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({ ...validTokenRecord, revoked: true })

      await expect(service.refreshToken('revoked-token')).rejects.toThrow('Refresh token reuse detected')
    })

    it('should throw UnauthorizedException when token is expired', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...validTokenRecord,
        expires_at: new Date(Date.now() - 1000)
      })

      await expect(service.refreshToken('expired-token')).rejects.toThrow('Refresh token expired')
    })

    it('should throw UnauthorizedException when user not found after token lookup', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(validTokenRecord)
      mockUserRepository.findById.mockResolvedValue(null)

      await expect(service.refreshToken('valid-token')).rejects.toThrow('User not found')
    })
  })

  // ─── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should logout successfully', async () => {
      mockBlacklist.blacklistToken.mockResolvedValue(undefined)

      await service.logout('user-1', 'jti-abc', 1700000000)

      expect(mockBlacklist.blacklistToken).toHaveBeenCalledWith('jti-abc', 1700000000)
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-1', revoked: false, used: false },
          data: { used: true }
        })
      )
    })

    it('should throw UnauthorizedException when jti is missing', async () => {
      await expect(service.logout('user-1', '', 1700000000)).rejects.toThrow('Invalid token')
      expect(mockBlacklist.blacklistToken).not.toHaveBeenCalled()
    })

    it('should throw UnauthorizedException when tokenExp is 0', async () => {
      await expect(service.logout('user-1', 'jti-abc', 0)).rejects.toThrow('Invalid token')
      expect(mockBlacklist.blacklistToken).not.toHaveBeenCalled()
    })
  })

  // ─── hashPassword & passwordMatches ─────────────────────────────────────────

  describe('hashPassword', () => {
    it('should hash password using argon2', async () => {
      const result = await service.hashPassword('mypassword')
      expect(result).toBe('hashed_password')
    })
  })

  describe('passwordMatches', () => {
    it('should return true when password matches', async () => {
      const result = await service.passwordMatches({ password_hash: 'hashed_password' }, 'mypassword')
      expect(result).toBe(true)
    })

    it('should return false when password does not match', async () => {
      const argon = require('argon2')
      argon.verify.mockResolvedValueOnce(false)

      const result = await service.passwordMatches({ password_hash: 'hashed_password' }, 'wrongpassword')
      expect(result).toBe(false)
    })
  })
})
