import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { IamHttpClient } from './IamTcpClient'

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        baseURL: config.get<string>('IAM_SERVICE_URL'),
        timeout: 5000,
        maxRedirects: 5
      })
    })
  ],
  providers: [
    {
      provide: 'IamClient',
      useClass: IamHttpClient
    }
  ],
  exports: ['IamClient']
})
export class IamModule {}
