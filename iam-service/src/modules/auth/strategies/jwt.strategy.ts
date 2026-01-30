import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { PrismaService } from '../../../prisma/prisma.service'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_TOKEN_SECRET') ?? process.env.JWT_ACCESS_TOKEN_SECRET
    })
  }

  async validate(payload: any) {
    const user = await this.prisma.users.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true }
    })
    if (!user) throw new UnauthorizedException('User not found')
    return user // attached to request.user
  }
}
