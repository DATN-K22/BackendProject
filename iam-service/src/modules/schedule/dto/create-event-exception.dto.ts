// src/schedule/dto/create-event-exception.dto.ts
import { IsDateString, IsOptional, IsString, IsInt } from 'class-validator';

export class CreateEventExceptionDto {
  @IsInt()
  event_id: bigint;

  @IsDateString()
  exception_date: string;

  @IsOptional()
  @IsString()
  reason?: string;
}