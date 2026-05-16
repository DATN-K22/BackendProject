import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CourseClient } from './CourseClient';

@Injectable()
export class CourseHttpClient implements CourseClient {
  constructor(private readonly httpService: HttpService) {}

  async enrollUserInCourse(userId: string, courseId: string): Promise<void> {
    await firstValueFrom(
      this.httpService.post('/course/enroll', {
        userId,
        courseId
      })
    );
  }
}
