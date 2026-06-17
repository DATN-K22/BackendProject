import { Module } from '@nestjs/common'
import { LabController } from './lab.controller'
import { LabService } from './lab.service'
import { LabRepository } from './lab.repository'
import { ISecretManagementService } from './secret-management.interface'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AwsSecretService } from './sm.service'
import { JwtModule } from '@nestjs/jwt'
import { IsbModule } from '../innovation-sandbox/isb.module'
@Module({
  imports: [ConfigModule, JwtModule.register({ global: true }), IsbModule],
  controllers: [LabController],
  providers: [
    LabService,
    LabRepository,
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
    }
  ],
  exports: [LabService, LabRepository, 'SECRET_MANAGEMENT_SERVICE']
})
export class LabModule {}
