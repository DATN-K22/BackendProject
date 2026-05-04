import { IsString } from '@nestjs/class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';

export enum ResourceType {
  VIDEO = 'video',
  DOCUMENT = 'document',
  IMAGE = 'image'
}

export class CreateFileDto {
  @ApiProperty({ example: 'lesson video' })
  @IsString()
  title!: string;

  @ApiProperty({ example: 'video', enum: ResourceType })
  @IsEnum(ResourceType)
  type!: ResourceType;

  @ApiProperty({ example: 'test.mp4' })
  @IsString()
  filename!: string;

  @ApiProperty({ example: '123', nullable: true })
  @IsOptional()
  @IsString()
  chapter_item_id?: string;

  @ApiProperty({ example: '123', nullable: true, deprecated: true })
  @IsOptional()
  @IsString()
  lesson_id?: string;

  @ApiProperty({ example: '21' })
  @IsString()
  course_id!: string;
}

export class CreateFilesDto {
  @ApiProperty({ type: [CreateFileDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFileDto)
  files!: CreateFileDto[];
}

class FileItemDto {
  @ApiProperty({ example: 'slide.pdf' })
  @IsString()
  filename!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  contentType!: string;
}

export class GetPresignedUrlsDto {
  @ApiProperty({ example: '21' })
  @IsString()
  courseId!: string;

  @ApiProperty({ example: '123', nullable: true })
  @IsOptional()
  @IsString()
  chapterItemId?: string;

  @ApiProperty({ example: '123', nullable: true, deprecated: true })
  @IsOptional()
  @IsString()
  lessonId?: string;

  @ApiProperty({ type: [FileItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FileItemDto)
  files!: FileItemDto[];
}

export class InitVideoUploadDto {
  @ApiProperty({ example: 'Lesson 1 - Introduction' })
  @IsString()
  title!: string;

  @ApiProperty({ example: '21' })
  @IsString()
  courseId!: string;

  @ApiProperty({ example: '5' })
  @IsString()
  lessonId!: string;

  @ApiProperty({ example: 524288000, description: 'File size in bytes' })
  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024 * 1024) // 10GB
  fileSize!: number;
}

export class GetPartPresignedUrlDto {
  @ApiProperty({ example: 1, description: 'Part number (1-indexed)' })
  @IsInt()
  @Min(1)
  @Max(10000)
  partNumber!: number;
}

export class PartDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  partNumber!: number;

  @ApiProperty({ example: '"d8c2eafd90c266e19ab9dcacc479f8af"' })
  @IsString()
  etag!: string;
}

export class CompleteVideoUploadDto {
  @ApiProperty({ type: [PartDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartDto)
  parts!: PartDto[];
}
