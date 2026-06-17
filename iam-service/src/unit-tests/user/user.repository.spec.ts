// src/unit-tests/user/user.repository.spec.ts

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(),
  UserRole: {
    user: 'user',
    admin: 'admin'
  },
  UserStatus: {
    active: 'active',
    pending: 'pending',
    temporary_banned: 'temporary_banned'
  }
}))

import { Test, TestingModule } from '@nestjs/testing'
import { InternalServerErrorException, Logger } from '@nestjs/common'
import { UserRole, UserStatus } from '@prisma/client'
import { UserRespository } from '../../modules/user/user.repository'
import { PrismaService } from '../../prisma/prisma.service'

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  password_hash: 'hashed_password',
  first_name: 'Test',
  last_name: 'User',
  role: 'user' as UserRole,
  status: 'active' as UserStatus,
  avt_url: null,
  created_at: new Date(),
  updated_at: new Date()
}

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

const mockPrisma = {
  users: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('UserRepository', () => {
  let repository: UserRespository

  beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserRespository, { provide: PrismaService, useValue: mockPrisma }]
    }).compile()

    repository = module.get<UserRespository>(UserRespository)
    jest.clearAllMocks()
  })

  // ─── findById ───────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return user when found', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(mockUser)

      const result = await repository.findById('user-1')

      expect(mockPrisma.users.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' }
      })
      expect(result).toEqual(mockUser)
    })

    it('should return null when user not found', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(null)

      const result = await repository.findById('nonexistent')

      expect(result).toBeNull()
    })

    it('should throw InternalServerErrorException on prisma error', async () => {
      mockPrisma.users.findUnique.mockRejectedValue(new Error('DB connection failed'))

      await expect(repository.findById('user-1')).rejects.toThrow(InternalServerErrorException)
      await expect(repository.findById('user-1')).rejects.toThrow('Failed to find user')
    })
  })

  // ─── findByIds ──────────────────────────────────────────────────────────────

  describe('findByIds', () => {
    it('should return projected users matching ids', async () => {
      const projected = [
        { id: 'user-1', first_name: 'Test', last_name: 'User', avt_url: null },
        { id: 'user-2', first_name: 'Jane', last_name: 'Doe', avt_url: null }
      ]
      mockPrisma.users.findMany.mockResolvedValue(projected)

      const result = await repository.findByIds(['user-1', 'user-2'])

      expect(mockPrisma.users.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['user-1', 'user-2'] } },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          avt_url: true
        }
      })
      expect(result).toEqual(projected)
    })

    it('should return empty array when no ids match', async () => {
      mockPrisma.users.findMany.mockResolvedValue([])

      const result = await repository.findByIds(['nonexistent'])

      expect(result).toEqual([])
    })

    it('should throw InternalServerErrorException on prisma error', async () => {
      mockPrisma.users.findMany.mockRejectedValue(new Error('DB error'))

      await expect(repository.findByIds(['user-1'])).rejects.toThrow(InternalServerErrorException)
      await expect(repository.findByIds(['user-1'])).rejects.toThrow('Failed to find users')
    })
  })

  // ─── updatePassword ─────────────────────────────────────────────────────────

  describe('updatePassword', () => {
    it('should update password successfully', async () => {
      mockPrisma.users.update.mockResolvedValue(undefined)

      await repository.updatePassword({ id: 'user-1' }, 'new_hashed_password')

      expect(mockPrisma.users.update).toHaveBeenCalledWith({
        data: { password_hash: 'new_hashed_password' },
        where: { id: 'user-1' }
      })
    })

    it('should throw InternalServerErrorException on prisma error', async () => {
      mockPrisma.users.update.mockRejectedValue(new Error('DB error'))

      await expect(repository.updatePassword({ id: 'user-1' }, 'new_hashed_password')).rejects.toThrow(
        InternalServerErrorException
      )
      await expect(repository.updatePassword({ id: 'user-1' }, 'new_hashed_password')).rejects.toThrow(
        'Failed to update password'
      )
    })
  })

  // ─── updateUser ─────────────────────────────────────────────────────────────

  describe('updateUser', () => {
    const updateDto = { first_name: 'Updated', last_name: 'Name' }

    it('should update user and return updated user', async () => {
      const updatedUser = { ...mockUser, ...updateDto }
      mockPrisma.users.update.mockResolvedValue(updatedUser)

      const result = await repository.updateUser('user-1', updateDto)

      expect(mockPrisma.users.update).toHaveBeenCalledWith({
        data: updateDto,
        where: { id: 'user-1' }
      })
      expect(result).toEqual(updatedUser)
    })

    it('should throw InternalServerErrorException on prisma error', async () => {
      mockPrisma.users.update.mockRejectedValue(new Error('DB error'))

      await expect(repository.updateUser('user-1', updateDto)).rejects.toThrow(InternalServerErrorException)
      await expect(repository.updateUser('user-1', updateDto)).rejects.toThrow('Failed to update user')
    })
  })

  // ─── findByEmail ────────────────────────────────────────────────────────────

  describe('findByEmail', () => {
    it('should return user when email found', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(mockUser)

      const result = await repository.findByEmail('test@example.com')

      expect(mockPrisma.users.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' }
      })
      expect(result).toEqual(mockUser)
    })

    it('should return null when email not found', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(null)

      const result = await repository.findByEmail('notfound@example.com')

      expect(result).toBeNull()
    })

    it('should throw InternalServerErrorException on prisma error', async () => {
      mockPrisma.users.findUnique.mockRejectedValue(new Error('DB error'))

      await expect(repository.findByEmail('test@example.com')).rejects.toThrow(InternalServerErrorException)
      await expect(repository.findByEmail('test@example.com')).rejects.toThrow('Failed to find user')
    })
  })

  // ─── createUser ─────────────────────────────────────────────────────────────

  describe('createUser', () => {
    const createData = {
      email: 'new@example.com',
      password_hash: 'hashed_password',
      first_name: 'New',
      last_name: 'User',
      role: 'user' as UserRole,
      status: 'pending' as UserStatus
    }

    it('should create user and return created user', async () => {
      const createdUser = { ...mockUser, ...createData, id: 'new-user-1' }
      mockPrisma.users.create.mockResolvedValue(createdUser)

      const result = await repository.createUser(createData)

      expect(mockPrisma.users.create).toHaveBeenCalledWith({ data: createData })
      expect(result).toEqual(createdUser)
    })

    it('should create user with only required fields', async () => {
      const minimalData = {
        email: 'minimal@example.com',
        password_hash: 'hashed_password',
        status: 'pending' as UserStatus
      }
      mockPrisma.users.create.mockResolvedValue({ ...mockUser, ...minimalData })

      await repository.createUser(minimalData)

      expect(mockPrisma.users.create).toHaveBeenCalledWith({ data: minimalData })
    })

    it('should propagate original error (not wrap in InternalServerErrorException)', async () => {
      // createUser rethrows error trực tiếp, không wrap
      const prismaError = { code: 'P2002', message: 'Unique constraint failed' }
      mockPrisma.users.create.mockRejectedValue(prismaError)

      await expect(repository.createUser(createData)).rejects.toMatchObject({ code: 'P2002' })
    })
  })

  // ─── updateStatusByEmail ────────────────────────────────────────────────────

  describe('updateStatusByEmail', () => {
    it('should update user status successfully', async () => {
      const updatedUser = { ...mockUser, status: 'active' as UserStatus }
      mockPrisma.users.update.mockResolvedValue(updatedUser)

      const result = await repository.updateStatusByEmail('test@example.com', 'active' as UserStatus)

      expect(mockPrisma.users.update).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        data: { status: 'active' }
      })
      expect(result).toEqual(updatedUser)
    })

    it('should throw InternalServerErrorException on prisma error', async () => {
      mockPrisma.users.update.mockRejectedValue(new Error('DB error'))

      await expect(repository.updateStatusByEmail('test@example.com', 'active' as UserStatus)).rejects.toThrow(
        InternalServerErrorException
      )
      await expect(repository.updateStatusByEmail('test@example.com', 'active' as UserStatus)).rejects.toThrow(
        'Failed to update status'
      )
    })
  })

  // ─── updatePasswordByEmail ──────────────────────────────────────────────────

  describe('updatePasswordByEmail', () => {
    it('should update password by email successfully', async () => {
      const updatedUser = { ...mockUser, password_hash: 'new_hashed_password' }
      mockPrisma.users.update.mockResolvedValue(updatedUser)

      const result = await repository.updatePasswordByEmail('test@example.com', 'new_hashed_password')

      expect(mockPrisma.users.update).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        data: { password_hash: 'new_hashed_password' }
      })
      expect(result).toEqual(updatedUser)
    })

    it('should throw InternalServerErrorException on prisma error', async () => {
      mockPrisma.users.update.mockRejectedValue(new Error('DB error'))

      await expect(repository.updatePasswordByEmail('test@example.com', 'new_hashed_password')).rejects.toThrow(
        InternalServerErrorException
      )
      await expect(repository.updatePasswordByEmail('test@example.com', 'new_hashed_password')).rejects.toThrow(
        'Failed to update password'
      )
    })
  })
})
