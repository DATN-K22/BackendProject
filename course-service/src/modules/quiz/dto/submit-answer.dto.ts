// dto/request/submit-answer.dto.ts
import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty } from 'class-validator'

export class SubmitAnswerDto {
  @ApiProperty({ description: 'The question being answered' })
  @IsString()
  @IsNotEmpty()
  questionId: string

  @ApiProperty({ description: 'The option the user selected' })
  @IsString()
  @IsNotEmpty()
  selectedOptionId: string
}
