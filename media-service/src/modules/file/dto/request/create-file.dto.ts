import { IsString } from "@nestjs/class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNumber, IsOptional } from "class-validator";

export enum ResourceType {
  VIDEO = 'video',
  DOCUMENT = 'document',
}

export class CreateFileDto{

    @ApiProperty({ example: 'lesson video' })
    @IsString()
    title: string;

    @ApiProperty({
        enum: ResourceType,
        example: ResourceType.VIDEO,
    })
    @IsEnum(ResourceType)
    type: ResourceType;

    @ApiProperty({ example: 'https://cdn.xxx/thumb.png', nullable: true})
    @IsString()
    @IsOptional()
    thumb: string | null;

    @ApiProperty({ example: 'https://cdn.xxx/video.mp4' })
    @IsString()
    link: string;

    @ApiProperty({ example: '' , nullable: true})
    @IsOptional()
    @IsString()
    manifest_url: string | null;

    @ApiProperty({ example: 10})
    @IsNumber()
    lesson_id: number; 
}

