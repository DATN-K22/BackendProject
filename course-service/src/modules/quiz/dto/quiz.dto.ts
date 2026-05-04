import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  MinLength
} from 'class-validator'
import { Type } from 'class-transformer'

export enum QuestionType {
  SINGLE_CHOICE = 'SINGLE_CHOICE',
  MULTI_CHOICE = 'MULTI_CHOICE',
  FILL_BLANK = 'FILL_BLANK'
}

// DTO: Create Option (nested inside question)
export class CreateOptionDto {
  @IsString()
  @MinLength(1)
  option_text!: string

  @IsBoolean()
  is_correct!: boolean

  @IsString()
  @IsOptional()
  description?: string

  @IsString()
  @IsOptional()
  reason?: string
}

// DTO: Create Question
export class CreateQuestionDto {
  @IsString()
  @MinLength(3)
  question_text!: string

  @IsEnum(QuestionType)
  questionType!: QuestionType

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  options?: CreateOptionDto[]
}

// DTO: Update Question
export class UpdateQuestionDto {
  @IsString()
  @MinLength(3)
  @IsOptional()
  question_text?: string

  @IsEnum(QuestionType)
  @IsOptional()
  questionType?: QuestionType
}

// ─── Option DTOs ──────────────────────────────────────────────────────────────

export class CreateOptionStandaloneDto {
  @IsString()
  @MinLength(1)
  option_text!: string

  @IsBoolean()
  is_correct!: boolean

  @IsString()
  @IsOptional()
  description?: string

  @IsString()
  @IsOptional()
  reason?: string
}

export class UpdateOptionDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  option_text?: string

  @IsBoolean()
  @IsOptional()
  is_correct?: boolean

  @IsString()
  @IsOptional()
  description?: string

  @IsString()
  @IsOptional()
  reason?: string
}
