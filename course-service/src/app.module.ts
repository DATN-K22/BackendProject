import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { PrismaModule } from './modules/prisma/prisma.module'
import { ConfigModule } from '@nestjs/config/dist/config.module'
import { CourseModule } from './modules/course/course.module'
import { ChapterModule } from './modules/chapter/chapter.module'
import { LessonModule } from './modules/lesson/lesson.module'
import { IamModule } from './modules/iam-service/iam.module'
import { MediaModule } from './modules/media-service/media.module'
import { McpModule } from '@rekog/mcp-nest'
import { QuizModule } from './modules/quiz/quiz.module'
import { RedisModule } from './modules/redis/redis.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env'
    }),
    McpModule.forRoot({
      name: 'course-mcp',
      version: '1.0.0'
    }),
    PrismaModule,
    CourseModule,
    ChapterModule,
    LessonModule,
    IamModule,
    MediaModule,
    QuizModule,
    RedisModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
