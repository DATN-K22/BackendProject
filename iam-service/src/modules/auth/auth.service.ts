import { ForbiddenException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as argon from 'argon2'
import { v4 as uuidv4 } from 'uuid'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthSignInDto, AuthSignUpDto } from './dto/auth.dto'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService
  ) {}

  private getAccessTokenPayload(user: any) {
    return { sub: user.id, email: user.email }
  }

  async signup(dto: AuthSignUpDto) {
    const hash = await argon.hash(dto.password)
    try {
      const user = await this.prisma.users.create({
        data: {
          email: dto.email,
          password_hash: hash,
          first_name: dto.first_name,
          last_name: dto.last_name,
          role: dto.role
        }
      })

      return this.createTokensForUser(user)
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new ForbiddenException('Email already exists')
      }
      throw new InternalServerErrorException('Signup failed')
    }
  }

  async signin(dto: AuthSignInDto) {
    const user = await this.prisma.users.findUnique({
      where: { email: dto.email }
    })
    if (!user) {
      throw new ForbiddenException('Credentials incorrect')
    }

    const passMatch = await argon.verify(user.password_hash, dto.password)
    if (!passMatch) {
      throw new ForbiddenException('Credentials incorrect')
    }

    return this.createTokensForUser(user)
  }

  private async createTokensForUser(user: any) {
    const jti = uuidv4()
    const payload = this.getAccessTokenPayload(user)

    const access_token = await this.jwtService.signAsync(payload, {
      expiresIn: '15m',
      secret: this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET') || process.env.JWT_ACCESS_TOKEN_SECRET
    })

    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET') || process.env.JWT_REFRESH_TOKEN_SECRET
    const refreshPayload = { ...payload, jti }

    const refresh_token = await this.jwtService.signAsync(refreshPayload, {
      expiresIn: '30d',
      secret: refreshSecret
    })

    const tokenHash = await argon.hash(refresh_token)
    const expiresAt = new Date()
    const expiresSec = Number(
      this.configService.get<number>('JWT_REFRESH_TOKEN_EXPIRES_IN_SECONDS') || 60 * 60 * 24 * 30
    )
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresSec)

    await this.prisma.refreshToken.create({
      data: {
        user_id: user.id,
        jti,
        token_hash: tokenHash,
        expires_at: expiresAt
      }
    })

    return { access_token, refresh_token }
  }

  async refreshToken(oldRefreshToken: string) {
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET') || process.env.JWT_REFRESH_TOKEN_SECRET
    try {
      const decoded = await this.jwtService.verifyAsync(oldRefreshToken, {
        secret: refreshSecret
      })

      const { jti, sub: userId } = decoded
      if (!jti || !userId) throw new UnauthorizedException('Invalid token')

      const tokenRecord = await this.prisma.refreshToken.findUnique({
        where: { jti }
      })

      if (!tokenRecord) throw new UnauthorizedException('Refresh token not found')

      if (tokenRecord.revoked) throw new UnauthorizedException('Refresh token revoked')

      if (tokenRecord.expires_at < new Date()) {
        throw new UnauthorizedException('Refresh token expired')
      }

      const match = await argon.verify(tokenRecord.token_hash, oldRefreshToken).catch(() => false)
      if (!match) {
        await this.prisma.refreshToken.updateMany({
          where: { user_id: userId },
          data: { revoked: true }
        })
        throw new UnauthorizedException('Refresh token reuse detected')
      }

      await this.prisma.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { revoked: true }
      })

      const user = await this.prisma.users.findUnique({ where: { id: userId } })
      if (!user) throw new UnauthorizedException('User not found')

      return this.createTokensForUser(user)
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.message?.includes('jwt expired')) {
        throw new UnauthorizedException('Refresh token expired')
      }
      if (err.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid refresh token')
      }
      throw new InternalServerErrorException('Could not refresh token')
    }
  }

  async logout(jti: string) {
    await this.prisma.refreshToken.updateMany({
      where: { jti },
      data: { revoked: true }
    })
    return { ok: true }
  }
}
