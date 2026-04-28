import { Injectable } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { MediaClient } from './MediaClient'

@Injectable()
export class MediaHtppClient implements MediaClient {
  constructor(private readonly httpService: HttpService) {}

  async getResourcesByChapterItemId(chapterItemId: string) {
    const response = await firstValueFrom(this.httpService.get(`/files/chapter-item/${chapterItemId}`))

    return response.data
  }

  async getResorcesByLessonId(lessonId: string) {
    return this.getResourcesByChapterItemId(lessonId)
  }
}
