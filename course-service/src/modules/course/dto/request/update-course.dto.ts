import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateCourseDto } from './create-course.dto';
import { IsNumber } from '@nestjs/class-validator';

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}
