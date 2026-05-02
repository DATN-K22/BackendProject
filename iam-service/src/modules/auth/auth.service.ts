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
import { ISecretManagementService } from './secret-management.interface'
import { UserRespository } from '../user/user.repository'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private blacklist: RedisBlacklistService,
    private readonly redis: RedisCacheService,
    @Inject(MESSAGE_BROKER)
    private readonly messageBroker: IMessageBroker,
    @Inject('SECRET_MANAGEMENT_SERVICE')
    private readonly awsSecret: ISecretManagementService,
    private readonly userRepository: UserRespository
  ) {}

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex')
  }

  private getAccessTokenPayload(user: Users) {
    return {
      user: {
        sub: user.id,
        displayName: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
        userName: user.email.split('@')[0],
        email: user.email,
        roles: [this.capitalize(user.role)]
      },
      jti: uuidv4()
    }
  }

  private capitalize(str?: string) {
    if (!str) return str
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
  }

  async signup(dto: AuthSignUpDto) {
    const hash = await this.hashPassword(dto.password)

    try {
      await this.userRepository.createUser({
        email: dto.email,
        password_hash: hash,
        first_name: dto.first_name,
        last_name: dto.last_name,
        role: dto.role,
        status: UserStatus.pending
      })

      await this.messageBroker.sendMail(dto.email)
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ForbiddenException('Email already exists')
      }
      throw new InternalServerErrorException('Signup failed')
    }
  }

  async sendOtp(email: string) {
    const user = await this.userRepository.findByEmail(email)

    if (!user) {
      throw new ForbiddenException('Email not found')
    }

    await this.messageBroker.sendMail(email)
  }

  async verifyOtp(email: string, otp: string, type?: string) {
    const user = await this.userRepository.findByEmail(email)

    if (!user) {
      throw new NotFoundException('Email not found')
    }

    const storedOtp = await this.redis.get(`otp:${email}`)
    if (!storedOtp) {
      throw new BadRequestException('OTP expired')
    }

    if (otp !== storedOtp) {
      throw new BadRequestException('Invalid OTP')
    }

    if (type !== 'forgot_password') {
      await Promise.all([
        this.redis.del(`otp:${email}`),
        this.userRepository.updateStatusByEmail(email, UserStatus.active)
      ])
    }
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    const user = await this.userRepository.findByEmail(email)

    if (!user) {
      throw new NotFoundException('Email not found')
    }

    const storedOtp = await this.redis.get(`otp:${email}`)
    if (!storedOtp) {
      throw new BadRequestException('OTP expired')
    }

    if (otp !== storedOtp) {
      throw new BadRequestException('Invalid OTP')
    }

    const hash = await this.hashPassword(newPassword)

    await this.userRepository.updatePasswordByEmail(email, hash)

    await this.redis.del(`otp:${email}`)
  }

  async signin(dto: AuthSignInDto) {
    const user = await this.userRepository.findByEmail(dto.email)

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (user.status === UserStatus.pending) {
      throw new ForbiddenException('Account not activated. Please verify your email.')
    }

    if (user.status === UserStatus.temporary_banned) {
      throw new ForbiddenException('Account is temporarily banned.')
    }

    const passMatch = await this.passwordMatches(user, dto.password)

    if (!passMatch) {
      throw new ForbiddenException('Credentials incorrect')
    }

    return {
      tokens: await this.createTokensForUser(user),
      user: this.formatUser(user)
    }
  }

  private async createTokensForUser(user: Users) {
    const payload = this.getAccessTokenPayload(user)

    const secretName = this.configService.getOrThrow<string>('JWT_SECRET_NAME')
    const jwtSecret = await this.awsSecret.getSecret(secretName)

    const access_token = await this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get('JWT_ACCESS_TOKEN_EXPIRATION'),
      secret: jwtSecret
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

    const user = await this.userRepository.findById(tokenRecord.user_id)
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
