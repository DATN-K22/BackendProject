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
  Headers
} from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthRefeshTokenDto, AuthSignInDto, AuthSignUpDto, JtiDto } from './dto/auth.dto'
import { Request, Response } from 'express'
import { ApiTags } from '@nestjs/swagger'
import { ApiResponse } from '../../utils/dto/ApiResponse'

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
@ApiTags('Authentication management')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() dto: AuthSignUpDto, @Res({ passthrough: true }) res: Response) {
    const { tokens, user } = await this.authService.signup(dto)

    return ApiResponse.OkResponse({
      tokens: tokens,
      user: user
    })
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

  @Post('logout')
  async logout(
    @Headers('x-user-id') userId: string,
    @Headers('x-user-jti') jti: string,
    @Headers('x-user-token-exp') tokenExp: number
  ) {
    return ApiResponse.OkResponse(await this.authService.logout(userId, jti, tokenExp))
  }
}
