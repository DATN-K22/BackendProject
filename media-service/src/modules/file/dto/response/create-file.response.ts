import { ApiProperty } from '@nestjs/swagger';

export class CreateFileResponse {
  @ApiProperty({ example: 1 })
  id!: string;

  @ApiProperty({ example: 'lesson video' })
  title!: string;

  @ApiProperty({ example: 'video' })
  type!: string;

  @ApiProperty({ example: 'https://cdn.xxx/thumb.png' })
  thumb!: string | null;

  @ApiProperty({ example: 'https://cdn.xxx/video.mp4' })
  link!: string;

  @ApiProperty({ example: '' })
  manifest_url!: string | null;

  @ApiProperty({ example: '2024-10-01T12:00:00Z' })
  created_at!: Date;

  @ApiProperty({ example: '2024-10-01T12:00:00Z' })
  updated_at!: Date;

  @ApiProperty({ example: 10, nullable: true })
  chapter_item_id!: number;

  @ApiProperty({ example: 10, nullable: true, deprecated: true })
  lesson_id!: number;
}
