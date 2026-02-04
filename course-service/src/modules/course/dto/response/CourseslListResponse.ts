import { IsNumber } from '@nestjs/class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ContentStatus } from '../request/create-course.dto';

export class CoursesListResponse {
  courses: CourseItem[];
  page: {
    total_pages: number;
    total_items: number;
    offset: number;
    limit: number;
  };
}

class CourseItem {
  @ApiProperty({ example: 'E.g: 1' })
  @IsString()
  owner_id: string;

  @IsString()
  @ApiProperty({
    example: 'AWS Certified Solutions Architect - Associate (SAA-C03): Scaling and Decoupling Architectures'
  })
  title: string;

  @ApiProperty({ example: '' })
  @IsString()
  @IsOptional()
  short_description?: string;

  @ApiProperty({ example: '' })
  @IsString()
  @IsOptional()
  thumbnail_url?: string;

  @ApiProperty({ example: '100000' })
  @IsNumber()
  price: number;

  @ApiProperty({
    example: ContentStatus.DRAFT,
    enum: ContentStatus
  })
  @IsEnum(ContentStatus)
  status: ContentStatus;
}
