// src/unit-tests/user/user.controller.spec.ts

jest.mock('../../utils/dto/ApiResponse.dto', () => ({
  ApiResponse: {
    OkResponse: jest.fn((data, message?) => ({ success: true, data, message }))
  }
}))

import { Test, TestingModule } from '@nestjs/testing'
import { UserController } from '../../modules/user/user.controller'
import { UserService } from '../../modules/user/user.service'
import { ApiResponse } from '../../utils/dto/ApiResponse.dto'
import { UpdateUserDto, UpdateUserPasswordDto } from '../../modules/user/dto/update-user.dto'

// ─── Mock Service ─────────────────────────────────────────────────────────────

const mockUserService = {
  findByIds: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  updatePassword: jest.fn()
}

describe('UserController', () => {
  let controller: UserController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: mockUserService }]
    }).compile()

    controller = module.get<UserController>(UserController)
    jest.clearAllMocks()
  })

  // ─── findByIds ──────────────────────────────────────────────────────────────

  describe('findByIds', () => {
    it('should return list of users by ids', async () => {
      const ids = ['user-1', 'user-2']
      const mockData = [
        { id: 'user-1', email: 'a@example.com' },
        { id: 'user-2', email: 'b@example.com' }
      ]
      mockUserService.findByIds.mockResolvedValue(mockData)

      const result = await controller.findByIds(ids)

      expect(mockUserService.findByIds).toHaveBeenCalledWith(ids)
      expect(result).toEqual(mockData)
    })

    it('should return empty array when no ids match', async () => {
      mockUserService.findByIds.mockResolvedValue([])

      const result = await controller.findByIds(['nonexistent'])

      expect(result).toEqual([])
    })

    it('should propagate error from service', async () => {
      mockUserService.findByIds.mockRejectedValue(new Error('DB error'))

      await expect(controller.findByIds(['user-1'])).rejects.toThrow('DB error')
    })
  })

  // ─── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return user wrapped in ApiResponse', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com' }
      mockUserService.findOne.mockResolvedValue(mockUser)

      const result = await controller.findOne('user-1')

      expect(mockUserService.findOne).toHaveBeenCalledWith('user-1')
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith(mockUser)
      expect(result).toEqual({ success: true, data: mockUser, message: undefined })
    })

    it('should propagate NotFoundException from service', async () => {
      mockUserService.findOne.mockRejectedValue(new Error('User not found'))

      await expect(controller.findOne('nonexistent')).rejects.toThrow('User not found')
    })
  })

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    const dto: UpdateUserDto = { first_name: 'John', last_name: 'Doe' } as UpdateUserDto

    it('should update user and return ApiResponse', async () => {
      const mockUpdated = { id: 'user-1', first_name: 'John', last_name: 'Doe' }
      mockUserService.update.mockResolvedValue(mockUpdated)

      const result = await controller.update('user-1', dto)

      expect(mockUserService.update).toHaveBeenCalledWith('user-1', dto)
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith(mockUpdated, 'User updated successfully')
      expect(result).toEqual({ success: true, data: mockUpdated, message: 'User updated successfully' })
    })

    it('should propagate error from service', async () => {
      mockUserService.update.mockRejectedValue(new Error('Update failed'))

      await expect(controller.update('user-1', dto)).rejects.toThrow('Update failed')
    })
  })

  // ─── updatePassword ─────────────────────────────────────────────────────────

  describe('updatePassword', () => {
    const dto: UpdateUserPasswordDto = {
      current_password: 'oldpass123',
      new_password: 'newpass456'
    } as UpdateUserPasswordDto

    it('should update password and return ApiResponse', async () => {
      mockUserService.updatePassword.mockResolvedValue(undefined)

      const result = await controller.updatePassword('user-1', dto)

      expect(mockUserService.updatePassword).toHaveBeenCalledWith('user-1', dto)
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith(undefined, 'Password updated successfully')
      expect(result).toEqual({ success: true, data: undefined, message: 'Password updated successfully' })
    })

    it('should propagate error from service', async () => {
      mockUserService.updatePassword.mockRejectedValue(new Error('Wrong password'))

      await expect(controller.updatePassword('user-1', dto)).rejects.toThrow('Wrong password')
    })
  })
})
