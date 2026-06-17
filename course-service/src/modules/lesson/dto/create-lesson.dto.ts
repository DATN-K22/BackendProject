import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ChapterItemType, ContentStatus, QuestionType } from '@prisma/client'
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsArray,
  IsNumber,
  IsBoolean,
  ValidateNested
} from 'class-validator'
import { Type } from 'class-transformer'

class CreateQuizOptionDto {
  @ApiProperty({
    description: 'Nội dung đáp án',
    example: 'Sử dụng biến môi trường để cấu hình theo từng môi trường'
  })
  @IsString()
  @IsNotEmpty()
  option_text!: string

  @ApiProperty({
    description: 'Đáp án đúng hay không',
    example: true
  })
  @IsBoolean()
  is_correct!: boolean

  @ApiPropertyOptional({
    description: 'Mô tả thêm cho đáp án',
    example: 'Đây là best practice khi triển khai production'
  })
  @IsString()
  @IsOptional()
  description?: string

  @ApiPropertyOptional({
    description: 'Giải thích lý do đáp án',
    example: 'Vì giúp tách biệt cấu hình khỏi source code'
  })
  @IsString()
  @IsOptional()
  reason?: string
}

class CreateQuizQuestionDto {
  @ApiProperty({
    description: 'Nội dung câu hỏi',
    example: 'Cách nào giúp ứng dụng 12-factor quản lý config tốt hơn?'
  })
  @IsString()
  @IsNotEmpty()
  question_text!: string

  @ApiPropertyOptional({
    description: 'Loại câu hỏi',
    enum: QuestionType,
    default: QuestionType.SINGLE_CHOICE
  })
  @IsEnum(QuestionType)
  @IsOptional()
  questionType?: QuestionType

  @ApiPropertyOptional({
    description: 'Danh sách đáp án',
    type: [CreateQuizOptionDto]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuizOptionDto)
  @IsOptional()
  options?: CreateQuizOptionDto[]
}

export class CreateLessonDto {
  @ApiPropertyOptional({
    description: 'Loại chapter item. Mặc định là lesson',
    enum: ChapterItemType,
    default: ChapterItemType.lesson
  })
  @IsEnum(ChapterItemType)
  @IsOptional()
  lessonType?: ChapterItemType

  @ApiProperty({
    description: 'ID của chapter',
    example: '1',
    type: String
  })
  @IsString()
  @IsNotEmpty()
  chapter_id!: string

  @ApiProperty({
    description: 'Tiêu đề chapter item',
    example: 'Bài 1: Cài đặt môi trường',
    maxLength: 255
  })
  @IsString()
  @IsNotEmpty()
  title!: string

  @ApiPropertyOptional({
    description: 'Mô tả ngắn của chapter item',
    example: 'Hướng dẫn cài đặt môi trường phát triển'
  })
  @IsString()
  @IsOptional()
  short_description?: string

  @ApiPropertyOptional({
    description: 'Mô tả chi tiết của chapter item',
    example: 'Trong bài học này bạn sẽ học cách cài đặt...'
  })
  @IsString()
  @IsOptional()
  long_description?: string

  @ApiPropertyOptional({
    description: 'Trạng thái chapter item của lesson',
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
    description: 'Đánh dấu lesson miễn phí (chỉ áp dụng khi type=lesson)',
    example: false
  })
  @IsBoolean()
  @IsOptional()
  is_free?: boolean

  @ApiPropertyOptional({
    description: 'Lease template ID (chỉ áp dụng khi type=lab)',
    example: 'lab-template-aws-ec2'
  })
  @IsString()
  @IsOptional()
  leaseTemplateId?: string

  @ApiPropertyOptional({
    description: 'Hướng dẫn cho lab (chỉ áp dụng khi type=lab)',
    example: 'Bước 1: SSH vào máy ảo. Bước 2: Cài Nginx...'
  })
  @IsString()
  @IsOptional()
  instruction?: string

  @ApiPropertyOptional({
    description: 'Danh sách câu hỏi quiz (chỉ áp dụng khi type=quiz)',
    type: [CreateQuizQuestionDto]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuizQuestionDto)
  @IsOptional()
  questions?: CreateQuizQuestionDto[]
}
