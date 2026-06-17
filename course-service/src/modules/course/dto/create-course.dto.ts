import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ContentStatus, CourseLevel } from '@prisma/client'
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, Min } from 'class-validator'

export class CreateCourseDto {
  @ApiProperty({
    description: 'ID của người tạo khóa học',
    example: 'user123'
  })
  @IsString()
  @IsNotEmpty()
  owner_id!: string

  @ApiProperty({
    description: 'Tiêu đề khóa học',
    example: 'NestJS Advanced',
    maxLength: 255
  })
  @IsString()
  @IsNotEmpty()
  title!: string

  @ApiPropertyOptional({
    description: 'Mô tả ngắn',
    example: 'Khóa học NestJS nâng cao'
  })
  @IsString()
  @IsOptional()
  short_description?: string

  @ApiPropertyOptional({
    description: 'Mô tả chi tiết',
    example: 'Khóa học này giúp bạn làm chủ NestJS...'
  })
  @IsString()
  @IsOptional()
  long_description?: string

  @ApiPropertyOptional({
    description: 'URL thumbnail',
    example: 'https://example.com/thumb.jpg',
    maxLength: 255
  })
  @IsString()
  @IsOptional()
  thumbnail_url?: string

  @ApiPropertyOptional({
    description: 'Giá khóa học',
    example: 99.99,
    default: 0,
    type: Number
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number

  @ApiPropertyOptional({
    description: 'Trạng thái khóa học',
    enum: ContentStatus,
    default: ContentStatus.draft
  })
  @IsEnum(ContentStatus)
  @IsOptional()
  status?: ContentStatus

  @ApiPropertyOptional({
    description: 'Cấp độ khóa học',
    enum: CourseLevel,
    default: CourseLevel.Beginner
  })
  @IsEnum(CourseLevel)
  @IsOptional()
  course_level?: CourseLevel

  @ApiPropertyOptional({
    description: 'Đánh giá trung bình',
    example: 4.5,
    default: 0,
    type: Number
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  rating?: number

  @ApiPropertyOptional({
    description: 'Ngôn ngữ',
    example: 'vi',
    default: 'simple'
  })
  @IsString()
  @IsOptional()
  language?: string
}
