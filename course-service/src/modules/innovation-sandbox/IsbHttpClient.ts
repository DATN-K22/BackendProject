import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { IsbClient } from './IsbClient'

@Injectable()
export class IsbHttpClient implements IsbClient {
  constructor(private readonly httpService: HttpService) {}

  async findLeasesByUserEmail(userEmail: string, token: string) {
    const response = await firstValueFrom(
      this.httpService.get(`/leases?userEmail=${userEmail}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
    )
    return response.data
  }

  async findLeaseById(leaseId: string, token: string) {
    const response = await firstValueFrom(
      this.httpService.get(`/leases/${leaseId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
    )
    return response.data
  }

  async startSession(leaseTemplateId: string, userId: string, userEmail: string, token: string) {
    const response = await firstValueFrom(
      this.httpService.post(
        `/leases`,
        {
          leaseTemplateUuid: leaseTemplateId,
          comments: userId,
          userEmail
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )
    )
    return response.data
  }
}
