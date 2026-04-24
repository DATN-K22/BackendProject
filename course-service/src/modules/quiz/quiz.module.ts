import { Module } from '@nestjs/common'
import { QuizService } from './quiz.service'
import { QuizController } from './quiz.controller'
import { QuizRepository } from './quiz.repository'

@Module({
  controllers: [QuizController],
  providers: [QuizService, QuizRepository],
  exports: [QuizService]
})
export class QuizModule {}
