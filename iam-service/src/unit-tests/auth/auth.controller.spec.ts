// auth.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import { ApiResponse } from '../../utils/dto/ApiResponse.dto'
import { AuthController } from '../../modules/auth/auth.controller'
import { AuthRefeshTokenDto, AuthSignInDto, AuthSignUpDto } from '../../modules/auth/dto/auth.dto'
import { ForgotPasswordDto, OTPDto, OTPVerificationDto } from '../../modules/auth/dto/otp.dto'
import { AuthService } from '../../modules/auth/auth.service'

jest.mock('../../utils/dto/ApiResponse.dto', () => ({
  ApiResponse: {
    OkResponse: jest.fn((data, message?) => ({ success: true, data, message }))
  }
}))

const mockAuthService = {
  signup: jest.fn(),
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  resetPassword: jest.fn(),
  signin: jest.fn(),
  refreshToken: jest.fn(),
  logout: jest.fn()
}

describe('AuthController', () => {
  let controller: AuthController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }]
    }).compile()

    controller = module.get<AuthController>(AuthController)
    jest.clearAllMocks()
  })

  // ─── signup ───────────────────────────────────────────────────────────────

  describe('signup', () => {
    it('should signup with full fields successfully', async () => {
      const dto: AuthSignUpDto = {
        email: 'test@example.com',
        password: 'abc@123',
        first_name: 'Test',
        last_name: 'User',
        role: 'user'
      }
      const serviceResult = { id: '1', email: dto.email }
      mockAuthService.signup.mockResolvedValue(serviceResult)

      const result = await controller.signup(dto, {} as any)

      expect(mockAuthService.signup).toHaveBeenCalledWith(dto)
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith(serviceResult, 'Signup successfully')
      expect(result).toEqual({ success: true, data: serviceResult, message: 'Signup successfully' })
    })

    it('should signup with only required fields', async () => {
      const dto: AuthSignUpDto = { email: 'test@example.com', password: 'abc@123' }
      mockAuthService.signup.mockResolvedValue({ id: '1', email: dto.email })

      await controller.signup(dto, {} as any)

      expect(mockAuthService.signup).toHaveBeenCalledWith(dto)
    })

    it('should propagate error from service', async () => {
      const dto: AuthSignUpDto = { email: 'test@example.com', password: 'abc@123' }
      mockAuthService.signup.mockRejectedValue(new Error('Email already exists'))

      await expect(controller.signup(dto, {} as any)).rejects.toThrow('Email already exists')
    })
  })

  // ─── sendOtp ──────────────────────────────────────────────────────────────

  describe('sendOtp', () => {
    it('should send OTP successfully', async () => {
      const dto: OTPDto = { email: 'test@example.com' }
      mockAuthService.sendOtp.mockResolvedValue(true)

      const result = await controller.sendOtp(dto)

      expect(mockAuthService.sendOtp).toHaveBeenCalledWith('test@example.com')
      expect(result).toEqual({ success: true, data: true, message: 'OTP sent successfully' })
    })

    it('should throw UnauthorizedException when email is empty string', async () => {
      const dto = { email: '' } as OTPDto

      await expect(controller.sendOtp(dto)).rejects.toThrow(UnauthorizedException)
      await expect(controller.sendOtp(dto)).rejects.toThrow('No email provided')
      expect(mockAuthService.sendOtp).not.toHaveBeenCalled()
    })
  })

  // ─── verifyOtp ────────────────────────────────────────────────────────────

  describe('verifyOtp', () => {
    const dto: OTPVerificationDto = { email: 'test@example.com', otp: '123456' }

    it('should verify OTP successfully without type', async () => {
      mockAuthService.verifyOtp.mockResolvedValue({ verified: true })

      const result = await controller.verifyOtp(dto)

      expect(mockAuthService.verifyOtp).toHaveBeenCalledWith('test@example.com', '123456', undefined)
      expect(result).toEqual({ success: true, data: { verified: true }, message: 'OTP verified successfully' })
    })

    it('should verify OTP with type = "reset-password"', async () => {
      mockAuthService.verifyOtp.mockResolvedValue({ verified: true })

      await controller.verifyOtp(dto, 'reset-password')

      expect(mockAuthService.verifyOtp).toHaveBeenCalledWith('test@example.com', '123456', 'reset-password')
    })

    it('should throw UnauthorizedException when email is missing', async () => {
      const invalid = { email: '', otp: '123456' } as OTPVerificationDto

      await expect(controller.verifyOtp(invalid)).rejects.toThrow(UnauthorizedException)
      expect(mockAuthService.verifyOtp).not.toHaveBeenCalled()
    })

    it('should throw UnauthorizedException when otp is missing', async () => {
      const invalid = { email: 'test@example.com', otp: '' } as OTPVerificationDto

      await expect(controller.verifyOtp(invalid)).rejects.toThrow(UnauthorizedException)
      expect(mockAuthService.verifyOtp).not.toHaveBeenCalled()
    })
  })

  // ─── resetPassword ────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    const dto: ForgotPasswordDto = {
      email: 'test@example.com',
      otp: '123456',
      newPassword: 'newpass123'
    }

    it('should reset password successfully', async () => {
      mockAuthService.resetPassword.mockResolvedValue(true)

      const result = await controller.resetPassword(dto)

      expect(mockAuthService.resetPassword).toHaveBeenCalledWith('test@example.com', '123456', 'newpass123')
      expect(result).toEqual({ success: true, data: true, message: 'Password reset successfully' })
    })

    it('should propagate error from service', async () => {
      mockAuthService.resetPassword.mockRejectedValue(new Error('Invalid OTP'))

      await expect(controller.resetPassword(dto)).rejects.toThrow('Invalid OTP')
    })
  })

  // ─── signin ───────────────────────────────────────────────────────────────

  describe('signin', () => {
    const dto: AuthSignInDto = { email: 'test@example.com', password: 'abc@123' }

    it('should signin and return tokens and user', async () => {
      const tokens = { access_token: 'access_jwt', refresh_token: 'refresh_jwt' }
      const user = { id: '1', email: dto.email }
      mockAuthService.signin.mockResolvedValue({ tokens, user })

      const result = await controller.signin(dto, {} as any)

      expect(mockAuthService.signin).toHaveBeenCalledWith(dto)
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith({ tokens, user })
      expect(result).toEqual({ success: true, data: { tokens, user }, message: undefined })
    })

    it('should propagate error from service', async () => {
      mockAuthService.signin.mockRejectedValue(new Error('Invalid credentials'))

      await expect(controller.signin(dto, {} as any)).rejects.toThrow('Invalid credentials')
    })
  })

  // ─── refreshToken ─────────────────────────────────────────────────────────

  describe('refreshToken', () => {
    it('should refresh tokens successfully', async () => {
      const dto: AuthRefeshTokenDto = { refresh_token: 'valid_refresh_token' }
      const newTokens = { access_token: 'new_access', refresh_token: 'new_refresh' }
      mockAuthService.refreshToken.mockResolvedValue(newTokens)

      const result = await controller.refreshToken(dto)

      expect(mockAuthService.refreshToken).toHaveBeenCalledWith('valid_refresh_token')
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith({
        access_token: 'new_access',
        refresh_token: 'new_refresh'
      })
    })

    it('should throw UnauthorizedException when refresh_token is empty', async () => {
      const dto: AuthRefeshTokenDto = { refresh_token: '' }

      await expect(controller.refreshToken(dto)).rejects.toThrow(UnauthorizedException)
      await expect(controller.refreshToken(dto)).rejects.toThrow('No refresh token provided')
      expect(mockAuthService.refreshToken).not.toHaveBeenCalled()
    })
  })

  // ─── logout ───────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should logout successfully', async () => {
      mockAuthService.logout.mockResolvedValue(true)

      const result = await controller.logout('user-123', 'jti-abc', 1700000000)

      expect(mockAuthService.logout).toHaveBeenCalledWith('user-123', 'jti-abc', 1700000000)
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith(true)
    })

    it('should propagate error from service', async () => {
      mockAuthService.logout.mockRejectedValue(new Error('Token already revoked'))

      await expect(controller.logout('user-123', 'jti-abc', 1700000000)).rejects.toThrow('Token already revoked')
    })
  })
})
