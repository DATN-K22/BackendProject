import { Injectable } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { IamClient } from './IamClient'

@Injectable()
export class IamHttpClient implements IamClient {
  constructor(private readonly httpService: HttpService) {}

  async findUserById(user_ids: string[]) {
    const response = await firstValueFrom(
      this.httpService.post('/user/find-by-ids', {
        user_ids
      })
    )

    return response.data
  }
}
