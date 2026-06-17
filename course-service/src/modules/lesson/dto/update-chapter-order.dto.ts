import { Type } from 'class-transformer'
import { IsArray, IsNumber, IsNumberString, ValidateNested } from 'class-validator'

export class UpdateLessonOrderItemDto {
  @IsNumberString()
  lesson_id!: string

  @IsNumber()
  sort_order!: number
}

export class UpdateLessonOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateLessonOrderItemDto)
  lessons!: UpdateLessonOrderItemDto[]
}
