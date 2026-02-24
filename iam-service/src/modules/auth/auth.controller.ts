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
  UnauthorizedException
} from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthRefeshTokenDto, AuthSignInDto, AuthSignUpDto, JtiDto } from './dto/auth.dto'
import { Request, Response } from 'express'
import { ApiTags } from '@nestjs/swagger'

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
    const tokens = await this.authService.signup(dto)

    res.cookie('refreshToken', tokens.refresh_token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/auth/refresh',
      maxAge: 1000 * 60 * 60 * 24 * 30
    })

    return { access_token: tokens.access_token, refresh_token: tokens.refresh_token, role: tokens.role }
  }

  @HttpCode(HttpStatus.OK)
  @Post('signin')
  async signin(@Body() dto: AuthSignInDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.signin(dto)

    res.cookie('refreshToken', tokens.refresh_token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/auth/refresh',
      maxAge: 1000 * 60 * 60 * 24 * 30
    })

    return { access_token: tokens.access_token, refresh_token: tokens.refresh_token, role: tokens.role }
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refreshToken(
    @Body() refreshToken: AuthRefeshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const token = refreshToken.refreshToken
    console.log('Received refresh token from cookie:', token) // Debug log
    if (!token) throw new UnauthorizedException('No refresh token provided')

    const tokens = await this.authService.refreshToken(token)

    res.cookie('refreshToken', tokens.refresh_token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/auth/refresh',
      maxAge: 1000 * 60 * 60 * 24 * 30
    })

    return { access_token: tokens.access_token, refresh_token: tokens.refresh_token }
  }

  @Post('logout')
  async logout(@Body() jti: JtiDto, @Res({ passthrough: true }) res: Response) {
    if (jti) {
      const result = await this.authService.logout(jti.jti)
      if (result == true) {
        res.clearCookie('refreshToken', { path: '/auth/refresh' })
        return { ok: true }
      }
    } else {
      throw new UnauthorizedException('No jti provided')
    }
  }
}
