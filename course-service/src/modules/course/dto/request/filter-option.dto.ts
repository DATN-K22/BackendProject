import { IsString, IsOptional, IsArray, IsEnum, IsNumber, Min } from "class-validator";
import { Type, Transform } from "class-transformer";
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum CourseLevel {
    Beginner = 'Beginner',
    Intermediate = 'Intermediate',
    Advanced = 'Advanced',
    Expert = 'Expert',
    AllLevels = 'AllLevels',
}

export class FilterOptionDto {
    // Keyword tìm kiếm
    @ApiPropertyOptional({
        description: 'Keyword search',
        example: 'AWS devops'
    })
    @IsOptional()
    @IsString()
    q?: string;

    // Trình độ (Multi-select)
    @ApiPropertyOptional({
        description: 'Course levels (comma-separated)',
        enum: CourseLevel,
        example: 'Beginner,Intermediate'
    })
    @IsOptional()
    @IsArray()
    @IsEnum(CourseLevel, { each: true })
    @Transform(({ value }) => (Array.isArray(value) ? value : value.split(',')))
    levels?: CourseLevel[];

    // Chỉ lấy khóa học trả phí hay miễn phí (nếu cần)
    @ApiPropertyOptional({
        description: 'Is paid course',
        example: true
    })
    @IsOptional()
    @Transform(({ value }) => value === 'true' || value === true)
    isPaid?: boolean;

    // Lọc theo khoảng giá
    @ApiPropertyOptional({
        description: 'Minimum price',
        example: 0
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    minPrice?: number;

    @ApiPropertyOptional({
        description: 'Maximum price',
        example: 100
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    maxPrice?: number;

    // Phân trang
    @ApiPropertyOptional({
        description: 'Page number',
        example: 1
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({
        description: 'Limit number of items per page',
        example: 10
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    limit?: number = 10;
}
