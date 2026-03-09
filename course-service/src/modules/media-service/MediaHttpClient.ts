import { Injectable } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { MediaClient } from './MediaClient'

@Injectable()
export class MediaHtppClient implements MediaClient {
  constructor(private readonly httpService: HttpService) {}

  async getResorcesByLessonId(lessonId: string) {
    const response = await firstValueFrom(this.httpService.get(`/files/lesson/${lessonId}`))

    return response.data
  }
}
