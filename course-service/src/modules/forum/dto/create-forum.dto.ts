import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator'

export class CreateForumDto {
  @ApiProperty({
    description: 'ID của khóa học',
    example: '1',
    type: String
  })
  @IsString()
  @IsNotEmpty()
  course_id: string

  @ApiPropertyOptional({
    description: 'Mô tả ngắn về forum',
    example: 'Forum thảo luận về khóa học NestJS',
    maxLength: 255
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  short_description?: string

  @ApiPropertyOptional({
    description: 'Mô tả chi tiết về forum',
    example: 'Đây là nơi mọi người thảo luận về các vấn đề liên quan đến khóa học...'
  })
  @IsString()
  @IsOptional()
  long_description?: string

  @ApiPropertyOptional({
    description: 'URL thumbnail của forum',
    example: 'https://example.com/forum-thumb.jpg',
    maxLength: 255
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  thumbnail_url?: string
}
