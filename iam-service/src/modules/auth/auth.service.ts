import { ForbiddenException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as argon from 'argon2'
import { v4 as uuidv4 } from 'uuid'
import { createHash } from 'node:crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthSignInDto, AuthSignUpDto } from './dto/auth.dto'
import { Users } from '@prisma/client'
import { RedisBlacklistService } from '../redis/redis-blacklist.service'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private blacklist: RedisBlacklistService
  ) {}

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex')
  }

  private getAccessTokenPayload(user: Users) {
    return {
      sub: user.id,
      role: user.role,
      jti: uuidv4() // mỗi access token có jti riêng để blacklist
    }
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

      return {
        tokens: await this.createTokensForUser(user),
        user: this.formatUser(user)
      }
    } catch (error) {
      if (error?.code === 'P2002') throw new ForbiddenException('Email already exists')
      throw new InternalServerErrorException('Signup failed')
    }
  }

  async signin(dto: AuthSignInDto) {
    const user = await this.prisma.users.findUnique({ where: { email: dto.email } })
    if (!user) throw new ForbiddenException('Credentials incorrect')

    const passMatch = await argon.verify(user.password_hash, dto.password)
    if (!passMatch) throw new ForbiddenException('Credentials incorrect')

    return {
      tokens: await this.createTokensForUser(user),
      user: this.formatUser(user)
    }
  }

  private async createTokensForUser(user: Users) {
    const payload = this.getAccessTokenPayload(user)

    const access_token = await this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get('JWT_ACCESS_TOKEN_EXPIRATION'),
      secret: this.configService.get('JWT_ACCESS_TOKEN_SECRET')
    })

    const rawToken = uuidv4()
    const tokenHash = this.hashToken(rawToken)

    const expiresAt = new Date()
    const expiresSec = Number(this.configService.get('JWT_REFRESH_TOKEN_EXPIRES_IN_SECONDS'))
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresSec)

    await this.prisma.refreshToken.create({
      data: {
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt
      }
    })

    return { access_token, refresh_token: rawToken, role: user.role }
  }

  async refreshToken(oldRefreshToken: string) {
    const tokenHash = this.hashToken(oldRefreshToken)

    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token_hash: tokenHash }
    })

    if (!tokenRecord) throw new UnauthorizedException('Token not found')

    // Reuse detection
    if (tokenRecord.used || tokenRecord.revoked) {
      await this.prisma.refreshToken.updateMany({
        where: { user_id: tokenRecord.user_id },
        data: { revoked: true }
      })

      throw new UnauthorizedException('Refresh token reuse detected')
    }

    if (tokenRecord.expires_at < new Date()) {
      throw new UnauthorizedException('Refresh token expired')
    }

    const user = await this.prisma.users.findUnique({ where: { id: tokenRecord.user_id } })
    if (!user) throw new UnauthorizedException('User not found')

    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { used: true }
    })

    const { access_token, refresh_token, role } = await this.createTokensForUser(user)
    return { access_token, refresh_token, role }
  }

  async logout(userId: string, jti: string, tokenExp: number) {
    if (!jti || !tokenExp) {
      throw new UnauthorizedException('Invalid token')
    }

    // Blacklist access token trong Redis
    await this.blacklist.blacklistToken(jti, tokenExp)

    // Revoke tất cả refresh tokens của user
    await this.prisma.refreshToken.updateMany({
      where: { user_id: userId, revoked: false, used: false },
      data: { used: true }
    })
  }

  private formatUser(user: Users) {
    return {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      avt_url: user.avt_url
    }
  }
}
