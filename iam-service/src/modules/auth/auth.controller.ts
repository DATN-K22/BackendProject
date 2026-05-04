import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Headers,
  Query,
  Patch,
  Param
} from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthRefeshTokenDto, AuthSignInDto, AuthSignUpDto, JtiDto } from './dto/auth.dto'
import { Request, Response } from 'express'
import { ApiTags } from '@nestjs/swagger'
import { ApiResponse } from '../../utils/dto/ApiResponse.dto'
import { ForgotPasswordDto, OTPDto, OTPVerificationDto } from './dto/otp.dto'
import { UpdateUserPasswordDto } from '../user/dto/update-user.dto'

@Controller('auth')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true }
  })
)
@ApiTags('Authentication management')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() dto: AuthSignUpDto, @Res({ passthrough: true }) res: Response) {
    return ApiResponse.OkResponse(await this.authService.signup(dto), 'Signup successfully')
  }

  @HttpCode(HttpStatus.OK)
  @Post('otp')
  async sendOtp(@Body() dto: OTPDto) {
    const { email } = dto
    if (!email) throw new UnauthorizedException('No email provided')
    return ApiResponse.OkResponse(await this.authService.sendOtp(email), 'OTP sent successfully')
  }

  @HttpCode(HttpStatus.OK)
  @Post('otp-verifications')
  async verifyOtp(@Body() dto: OTPVerificationDto, @Query('type') type?: string) {
    const { email, otp } = dto
    if (!email || !otp) throw new UnauthorizedException('No email or OTP provided')
    return ApiResponse.OkResponse(await this.authService.verifyOtp(email, otp, type), 'OTP verified successfully')
  }

  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() dto: ForgotPasswordDto) {
    return ApiResponse.OkResponse(
      await this.authService.resetPassword(dto.email, dto.otp, dto.newPassword),
      'Password reset successfully'
    )
  }

  @HttpCode(HttpStatus.OK)
  @Post('signin')
  async signin(@Body() dto: AuthSignInDto, @Res({ passthrough: true }) res: Response) {
    const { tokens, user } = await this.authService.signin(dto)

    return ApiResponse.OkResponse({
      tokens: tokens,
      user: user
    })
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refreshToken(@Body() refreshToken: AuthRefeshTokenDto) {
    const token = refreshToken.refresh_token
    if (!token) throw new UnauthorizedException('No refresh token provided')

    const tokens = await this.authService.refreshToken(token)

    return ApiResponse.OkResponse({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token
    })
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @Headers('x-user-id') userId: string,
    @Headers('x-user-jti') jti: string,
    @Headers('x-user-token-exp') tokenExp: number
  ) {
    return ApiResponse.OkResponse(await this.authService.logout(userId, jti, tokenExp))
  }

  @Patch(':id/password')
  async updatePassword(@Param('id') id: string, @Body() updatePassword: UpdateUserPasswordDto) {
    return ApiResponse.OkResponse(
      await this.authService.updatePassword(id, updatePassword),
      'Password updated successfully'
    )
  }
}
