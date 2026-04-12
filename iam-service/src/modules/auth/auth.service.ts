import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as argon from 'argon2'
import { v4 as uuidv4 } from 'uuid'
import { createHash } from 'node:crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthSignInDto, AuthSignUpDto } from './dto/auth.dto'
import { Users, UserStatus } from '@prisma/client'
import { RedisBlacklistService } from '../redis/redis-blacklist.service'
import { IMessageBroker } from '../message_broker/message-broker.interface'
import { MESSAGE_BROKER } from '../message_broker/message-broker.token'
import { RedisCacheService } from '../redis/redis-cache.service'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private blacklist: RedisBlacklistService,
    private readonly redis: RedisCacheService,
    @Inject(MESSAGE_BROKER)
    private readonly messageBroker: IMessageBroker
  ) {}

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex')
  }

  private getAccessTokenPayload(user: Users) {
    return {
      sub: user.id,
      role: user.role,
      email: user.email,
      jti: uuidv4() // mỗi access token có jti riêng để blacklist
    }
  }

  async signup(dto: AuthSignUpDto) {
    const hash = await this.hashPassword(dto.password)
    try {
      await this.prisma.users.create({
        data: {
          email: dto.email,
          password_hash: hash,
          first_name: dto.first_name,
          last_name: dto.last_name,
          role: dto.role,
          status: UserStatus.pending
        }
      })

      await this.messageBroker.sendMail(dto.email)
    } catch (error) {
      if (error?.code === 'P2002') {
        Logger.debug(`Signup failed due to duplicate email: ${dto.email}`)
        throw new ForbiddenException('Email already exists')
      }
      Logger.debug(`Signup failed with unexpected error for email: ${dto.email}`)
      throw new InternalServerErrorException('Signup failed')
    }
  }

  async sendOtp(email: string) {
    const user = await this.prisma.users.findUnique({ where: { email } })
    if (!user) {
      Logger.debug(`sendOtp failed: email not found: ${email}`)
      throw new ForbiddenException('Email not found')
    }
    await this.messageBroker.sendMail(email)
  }

  async verifyOtp(email: string, otp: string, type?: string) {
    const user = await this.prisma.users.findUnique({ where: { email } })
    if (!user) {
      Logger.debug(`verifyOtp failed: email not found: ${email}`)
      throw new NotFoundException('Email not found')
    }

    const storedOtp = await this.redis.get(`otp:${email}`)
    if (!storedOtp) {
      Logger.debug(`verifyOtp failed: OTP expired for email: ${email}`)
      throw new BadRequestException('OTP expired')
    }

    if (otp !== storedOtp) {
      Logger.debug(`verifyOtp failed: invalid OTP for email: ${email}`)
      throw new BadRequestException('Invalid OTP')
    }
    if (type !== 'forgot_password') {
      await Promise.all([
        this.redis.del(`otp:${email}`),
        this.prisma.users.update({ where: { email }, data: { status: UserStatus.active } })
      ])
    }
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    const user = await this.prisma.users.findUnique({ where: { email } })
    if (!user) {
      Logger.debug(`resetPassword failed: email not found: ${email}`)
      throw new NotFoundException('Email not found')
    }

    const storedOtp = await this.redis.get(`otp:${email}`)
    if (!storedOtp) {
      Logger.debug(`resetPassword failed: OTP expired for email: ${email}`)
      throw new BadRequestException('OTP expired')
    }

    if (otp !== storedOtp) {
      Logger.debug(`resetPassword failed: invalid OTP for email: ${email}`)
      throw new BadRequestException('Invalid OTP')
    }

    const hash = await this.hashPassword(newPassword)
    await this.prisma.users.update({
      where: { email },
      data: { password_hash: hash }
    })

    await this.redis.del(`otp:${email}`)
  }

  async signin(dto: AuthSignInDto) {
    const user = await this.prisma.users.findUnique({ where: { email: dto.email } })
    if (!user) {
      Logger.debug(`signin failed: user not found for email: ${dto.email}`)
      throw new NotFoundException('User not found')
    }

    if (user.status === UserStatus.pending) {
      Logger.debug(`signin failed: account pending for user id: ${user.id}`)
      throw new ForbiddenException('Account not activated. Please verify your email.')
    }

    if (user.status === UserStatus.temporary_banned) {
      Logger.debug(`signin failed: temporary banned user id: ${user.id}`)
      throw new ForbiddenException('Account is temporarily banned.')
    }

    const passMatch = await this.passwordMatches(user, dto.password)
    if (!passMatch) {
      Logger.debug(`signin failed: credentials incorrect for user id: ${user.id}`)
      throw new ForbiddenException('Credentials incorrect')
    }

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

    if (!tokenRecord) {
      Logger.debug('refreshToken failed: token not found')
      throw new UnauthorizedException('Token not found')
    }

    // Reuse detection
    if (tokenRecord.used || tokenRecord.revoked) {
      await this.prisma.refreshToken.updateMany({
        where: { user_id: tokenRecord.user_id },
        data: { revoked: true }
      })

      Logger.debug(`refreshToken failed: token reuse detected for user id: ${tokenRecord.user_id}`)
      throw new UnauthorizedException('Refresh token reuse detected')
    }

    if (tokenRecord.expires_at < new Date()) {
      Logger.debug(`refreshToken failed: token expired for user id: ${tokenRecord.user_id}`)
      throw new UnauthorizedException('Refresh token expired')
    }

    const user = await this.prisma.users.findUnique({ where: { id: tokenRecord.user_id } })
    if (!user) {
      Logger.debug(`refreshToken failed: user not found for user id: ${tokenRecord.user_id}`)
      throw new UnauthorizedException('User not found')
    }

    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { used: true }
    })

    const { access_token, refresh_token, role } = await this.createTokensForUser(user)
    return { access_token, refresh_token, role }
  }

  async logout(userId: string, jti: string, tokenExp: number) {
    Logger.debug(`Attempting logout for user id: ${userId} with jti: ${jti}, tokenExp: ${tokenExp}`)
    if (!jti || !tokenExp) {
      Logger.debug(`logout failed: invalid token data for user id: ${userId}`)
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

  public async hashPassword(password: string) {
    return await argon.hash(password)
  }

  public async passwordMatches(user: { password_hash: string }, password: string) {
    return await argon.verify(user.password_hash, password)
  }
}
