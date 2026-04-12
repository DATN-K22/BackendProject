import { IsString } from '@nestjs/class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional } from 'class-validator';

export enum ResourceType {
  VIDEO = 'video',
  DOCUMENT = 'document',
  IMAGE = 'image'
}

export class CreateFileDto {
  @ApiProperty({ example: 'lesson video' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'video' })
  @IsEnum(ResourceType)
  type: ResourceType;

  @ApiProperty({ example: 'test.mp4' })
  @IsString()
  filename: string;

  @ApiProperty({ example: '123', nullable: true })
  @IsString()
  lesson_id: string;

  @ApiProperty({ example: '21', nullable: true })
  @IsString()
  course_id: string;
}
