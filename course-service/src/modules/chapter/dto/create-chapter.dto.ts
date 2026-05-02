import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ContentStatus } from '@prisma/client'
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class CreateChapterDto {
  @ApiPropertyOptional({
    description: 'ID của khóa học',
    example: '1',
    type: String
  })
  @IsString()
  @IsOptional()
  course_id?: string

  @ApiPropertyOptional({
    description: 'ID resource liên kết',
    example: '1',
    type: String
  })
  @IsString()
  @IsOptional()
  resource_id?: string

  @ApiProperty({
    description: 'Tiêu đề chapter',
    example: 'Chapter 1: Giới thiệu',
    maxLength: 255
  })
  @IsString()
  @IsNotEmpty()
  title!: string

  @ApiPropertyOptional({
    description: 'Mô tả ngắn',
    example: 'Giới thiệu về khóa học'
  })
  @IsString()
  @IsOptional()
  short_description?: string

  @ApiPropertyOptional({
    description: 'Mô tả chi tiết',
    example: 'Chapter này giới thiệu tổng quan về khóa học...'
  })
  @IsString()
  @IsOptional()
  long_description?: string

  @ApiPropertyOptional({
    description: 'Trạng thái chapter',
    enum: ContentStatus,
    default: ContentStatus.draft
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
}
