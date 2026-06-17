import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { CourseHttpClient } from './CourseHttpClient';

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        baseURL: config.get<string>('COURSE_SERVICE_URL'),
        timeout: 5000,
        maxRedirects: 5
      })
    })
  ],
  providers: [
    {
      provide: 'CourseClient',
      useClass: CourseHttpClient
    }
  ],
  exports: ['CourseClient']
})
export class CourseModule {}
