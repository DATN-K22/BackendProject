import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { JwtStrategy } from './strategies/jwt.strategy'
import { PrismaModule } from '../../prisma/prisma.module'
import { ISecretManagementService } from './secret-management.interface'
import { AwsSecretService } from './sm.service'
import { PrismaService } from '../../prisma/prisma.service'
import { UserModule } from '../user/user.module'

@Module({
  imports: [UserModule, ConfigModule, PrismaModule, JwtModule.register({ global: true })],
  controllers: [AuthController],
  providers: [
    {
      provide: 'SECRET_MANAGEMENT_SERVICE',
      useFactory: (configService: ConfigService): ISecretManagementService => {
        const provider = configService.get<string>('SECRET_MANAGEMENT_SERVICE', 'local')

        switch (provider) {
          case 'aws-secrets-manager':
            return new AwsSecretService(configService)
          default:
            throw new Error(`Unsupported secret management service: ${provider}`)
        }
      },
      inject: [ConfigService]
    },
    AuthService,
    {
      provide: JwtStrategy,
      useFactory: (configService: ConfigService, prisma: PrismaService, secretService: ISecretManagementService) =>
        new JwtStrategy(configService, prisma, secretService),
      inject: [ConfigService, PrismaService, 'SECRET_MANAGEMENT_SERVICE']
    }
  ],
  exports: [AuthService]
})
export class AuthModule {}
