// iam.module.ts
import { Module } from '@nestjs/common'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { IamTcpClient } from './IamTcpClient'

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'IAM_SERVICE',
        transport: Transport.TCP,
        options: {
          host: 'localhost',
          port: 4001
        }
      }
    ])
  ],
  providers: [
    {
      provide: 'IamClient',
      useClass: IamTcpClient
    }
  ],
  exports: ['IamClient']
})
export class IamModule {}
