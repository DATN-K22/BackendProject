import { EventStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsInt, IsOptional, IsString} from "class-validator";

export class CreateEventDto {
    @IsString()
    title: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    location?: string;

    @IsEnum(EventStatus)
    @IsOptional()
    status?: EventStatus;

    @IsDateString()
    time_start: string;

    @IsDateString()
    time_end: string;

    @IsOptional()
    @IsString()
    timezone?: string;

    @IsOptional()
    @IsString()
    rrule_string?: string;

    @IsOptional()
    @IsDateString()
    recurrence_id?: string;

    @IsOptional()
    @IsInt()
    original_event_id?: bigint;
}

export class EventResponseDto {
    id: bigint;
    user_id: string;
    uid: string;
    title: string;
    description?: string;
    location?: string;
    status: EventStatus;
    time_start: Date;
    time_end: Date;
    timezone?: string;
    rrule_string?: string;
    sequence: number;
    created_at: Date;
    updated_at: Date;
    recurrence_id?: Date;
    original_event_id?: bigint;
}

export class EventExceptionResponseDto {
    id: bigint;
    event_id: bigint;
    exception_date: Date;
    reason?: string;
}

export class EventWithRelationsDto extends EventResponseDto {
    exception_dates?: EventExceptionResponseDto[];
    exceptions?: EventResponseDto[];
}