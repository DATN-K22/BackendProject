import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsInt, IsNumber, IsNumberString, Min, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export class UpdateChapterOrderItemDto {
  @IsNumberString()
  chapter_id!: string

  @IsNumber()
  sort_order!: number
}

export class UpdateChapterOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateChapterOrderItemDto)
  chapters!: UpdateChapterOrderItemDto[]
}
