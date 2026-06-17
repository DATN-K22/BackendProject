import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ContentStatus } from '@prisma/client'
import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator'

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
    description: 'Trạng thái chapter',
    enum: ContentStatus,
    default: ContentStatus.draft
  })
  @IsEnum(ContentStatus)
  @IsOptional()
  status?: ContentStatus
}
