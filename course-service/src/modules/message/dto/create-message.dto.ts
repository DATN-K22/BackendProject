import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator'

export class CreateMessageDto {
  @ApiProperty({ example: 1, description: 'ID của forum' })
  @IsNumber()
  @IsNotEmpty()
  forum_id: number

  @ApiProperty({ example: '019bfef8-084e-7ce2-aed8-c990c41d7045', description: 'ID của user', required: false })
  @IsString()
  @IsOptional()
  user_id?: string

  @ApiProperty({
    example: 1,
    description: 'ID của message cha (nếu là reply)',
    required: false
  })
  @IsNumber()
  @IsOptional()
  parent_message_id?: number

  @ApiProperty({ example: 'Nội dung message', description: 'Nội dung message' })
  @IsString()
  @IsNotEmpty()
  content: string

  @ApiProperty({
    example: '2026-02-25T00:00:00.000Z',
    description: 'Thời gian mở message',
    required: false
  })
  @IsOptional()
  open_time?: Date

  @ApiProperty({
    example: '2026-02-25T00:00:00.000Z',
    description: 'Thời gian đóng message',
    required: false
  })
  @IsOptional()
  closed_time?: Date

  @ApiProperty({
    example: 'active',
    description: 'Trạng thái message',
    required: false,
    default: 'active'
  })
  @IsString()
  @IsOptional()
  status?: string
}
