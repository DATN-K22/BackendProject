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
import { IamModule } from './modules/iam-service/iam.module'
import { MediaModule } from './modules/media-service/media.module'
import { McpModule } from '@rekog/mcp-nest'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env'
    }),
    McpModule.forRoot({
      name: "course-mcp",
      version:'1.0.0'
    }),
    PrismaModule,
    CourseModule,
    ChapterModule,
    LessonModule,
    ForumModule,
    MessageModule,
    IamModule,
    MediaModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
