import { Test, TestingModule } from '@nestjs/testing'
import { UserService } from '../../modules/user/user.service'
import { UserRespository } from '../../modules/user/user.repository'
import { AuthService } from '../../modules/auth/auth.service'
import { ForbiddenException, NotFoundException } from '@nestjs/common'

describe('UserService', () => {
  let service: UserService
  let repo: jest.Mocked<UserRespository>
  let authService: jest.Mocked<AuthService>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: UserRespository,
          useValue: {
            findByIds: jest.fn(),
            findById: jest.fn(),
            updateUser: jest.fn(),
            updatePassword: jest.fn()
          }
        },
        {
          provide: AuthService,
          useValue: {
            passwordMatches: jest.fn(),
            hashPassword: jest.fn()
          }
        }
      ]
    }).compile()

    service = module.get<UserService>(UserService)
    repo = module.get(UserRespository)
    authService = module.get(AuthService)
  })

  describe('findByIds', () => {
    it('should map users correctly', async () => {
      const users = [
        { id: '1', first_name: 'John', last_name: 'Doe', avt_url: 'url1' },
        { id: '2', first_name: 'Jane', last_name: 'Smith', avt_url: 'url2' }
      ]

      repo.findByIds.mockResolvedValue(users as any)

      const result = await service.findByIds(['1', '2'])

      expect(repo.findByIds).toHaveBeenCalledWith(['1', '2'])
      expect(result).toEqual([
        { id: '1', name: 'John Doe', avt_url: 'url1' },
        { id: '2', name: 'Jane Smith', avt_url: 'url2' }
      ])
    })
  })

  describe('findOne', () => {
    it('should return user if exists', async () => {
      const user = { id: '1' }
      repo.findById.mockResolvedValue(user as any)

      const result = await service.findOne('1')

      expect(result).toEqual(user)
    })

    it('should throw error if user not found', async () => {
      repo.findById.mockResolvedValue(null)

      await expect(service.findOne('1')).rejects.toThrow('User not found')
    })
  })

  describe('update', () => {
    it('should call repository updateUser', async () => {
      const dto = { first_name: 'New' }
      repo.updateUser.mockResolvedValue({ id: '1', ...dto } as any)

      const result = await service.update('1', dto as any)

      expect(repo.updateUser).toHaveBeenCalledWith('1', dto)
      expect(result).toEqual({ id: '1', ...dto })
    })
  })

  describe('updatePassword', () => {
    const dto = {
      current_password: 'old',
      new_password: 'new'
    }

    it('should update password successfully', async () => {
      const user = { id: '1', password_hash: 'hashed' }

      repo.findById.mockResolvedValue(user as any)
      authService.passwordMatches.mockResolvedValue(true)
      authService.hashPassword.mockResolvedValue('newHashed')

      await service.updatePassword('1', dto as any)

      expect(repo.findById).toHaveBeenCalledWith('1')
      expect(authService.passwordMatches).toHaveBeenCalledWith(user, dto.current_password)
      expect(authService.hashPassword).toHaveBeenCalledWith(dto.new_password)
      expect(repo.updatePassword).toHaveBeenCalledWith(user, 'newHashed')
    })

    it('should throw NotFoundException if user not found', async () => {
      repo.findById.mockResolvedValue(null)

      await expect(service.updatePassword('1', dto as any)).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException if password incorrect', async () => {
      const user = { id: '1' }

      repo.findById.mockResolvedValue(user as any)
      authService.passwordMatches.mockResolvedValue(false)

      await expect(service.updatePassword('1', dto as any)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('remove', () => {
    it('should return correct string', () => {
      const result = service.remove('1')
      expect(result).toBe('This action removes a #1 user')
    })
  })
})
