import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { PrismaService } from '../../../prisma/prisma.service'
import { ConfigService } from '@nestjs/config'
import { ISecretManagementService } from '../secret-management.interface'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject('SECRET_MANAGEMENT_SERVICE')
    private readonly awsSecret: ISecretManagementService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: async (
        _request: unknown,
        _rawJwtToken: unknown,
        done: (err: Error | null, secret?: string) => void
      ) => {
        try {
          const secretName = config.getOrThrow<string>('JWT_SECRET_NAME')
          const secret = await awsSecret.getSecret(secretName)
          done(null, secret)
        } catch (err) {
          done(err instanceof Error ? err : new Error(String(err)))
        }
      }
    })
  }

  async validate(payload: {
    user: { email: string; userName: string; displayName: string; roles: string[] }
    jti: string
    exp: number
  }) {
    const user = await this.prisma.users.findUnique({
      where: { email: payload.user.email }, // ← đổi từ id: payload.sub
      select: { id: true, email: true, role: true }
    })
    if (!user) throw new UnauthorizedException('User not found')

    return { ...user, jti: payload.jti, tokenExp: payload.exp }
  }
}
