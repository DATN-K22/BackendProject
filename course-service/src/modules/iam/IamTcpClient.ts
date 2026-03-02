import { Inject, Injectable } from '@nestjs/common'
import { ClientProxy } from '@nestjs/microservices'
import { firstValueFrom } from 'rxjs'
import { IamClient } from './IamClient'

@Injectable()
export class IamTcpClient implements IamClient {
  constructor(
    @Inject('IAM_SERVICE')
    private readonly client: ClientProxy
  ) {}

  async findUserById(user_ids: string[]) {
    return firstValueFrom(this.client.send('iam.user.findByIds', user_ids))
  }
}
