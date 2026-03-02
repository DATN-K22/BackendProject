import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { PrismaModule } from './modules/prisma/prisma.module'
import { ConfigModule } from '@nestjs/config/dist/config.module'
import { CourseModule } from './modules/course/course.module'
import { ChapterModule } from './modules/chapter/chapter.module'
import { LessonModule } from './modules/lesson/lesson.module'
import { ForumModule } from './modules/forum/forum.module'
import { MessageModule } from './modules/message/message.module'
import { IamModule } from './modules/iam/iam.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env'
    }),
    PrismaModule,
    CourseModule,
    ChapterModule,
    LessonModule,
    ForumModule,
    MessageModule,
    IamModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
