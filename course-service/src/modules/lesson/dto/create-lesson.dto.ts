import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ContentStatus } from '@prisma/client'
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, Min, IsArray, IsNumber } from 'class-validator'
import { Type } from 'class-transformer'
import { LessonType } from '@prisma/client'

export class CreateLessonDto {
  @ApiProperty({
    description: 'ID của chapter',
    example: '1',
    type: String
  })
  @IsString()
  @IsNotEmpty()
  chapter_id: string

  @ApiProperty({
    description: 'Tiêu đề lesson',
    example: 'Bài 1: Cài đặt môi trường',
    maxLength: 255
  })
  @IsString()
  @IsNotEmpty()
  title: string

  @ApiPropertyOptional({
    description: 'Mô tả ngắn',
    example: 'Hướng dẫn cài đặt môi trường phát triển'
  })
  @IsString()
  @IsOptional()
  short_description?: string

  @ApiPropertyOptional({
    description: 'Mô tả chi tiết',
    example: 'Trong bài học này bạn sẽ học cách cài đặt...'
  })
  @IsString()
  @IsOptional()
  long_description?: string

  @ApiPropertyOptional({
    description: 'URL thumbnail',
    example: 'https://example.com/lesson-thumb.jpg',
    maxLength: 255
  })
  @IsString()
  @IsOptional()
  thumbnail_url?: string

  @ApiPropertyOptional({
    description: 'Trạng thái lesson',
    enum: ContentStatus,
    default: ContentStatus.published
  })
  @IsEnum(ContentStatus)
  @IsOptional()
  status?: ContentStatus

  @ApiPropertyOptional({
    description: 'Thứ tự sắp xếp',
    example: 1,
    type: Number
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sort_order?: number

  @ApiPropertyOptional({
    description: 'Thời lượng bài học (phút)',
    example: 30,
    type: Number
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  duration?: number

  @ApiPropertyOptional({
    description: 'Danh sách ID resources',
    example: ['1', '2', '3'],
    type: [String],
    isArray: true
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  resources?: string[]

  @ApiPropertyOptional({
    description: 'Loại bài học',
    enum: LessonType,
    default: LessonType.video
  })
  @IsEnum(LessonType)
  @IsOptional()
  type?: LessonType

  @ApiPropertyOptional({
    description: 'Thời lượng bài học (phút)',
    example: 10,
    type: Number
  })
  @Type(() => Number)
  @IsOptional()
  duration?: number
}
