import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { CreateEventDto, CreateEventExceptionDto, UpdateEventDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('schedule')
@UseGuards(JwtAuthGuard)
export class ScheduleController {
    constructor(private readonly scheduleService: ScheduleService) {}

    @Get()
    async getMySchedule(@GetUser('id') userId: string) {
        return this.scheduleService.getMySchedule(userId);
    }

    @Post('events')
    async createEvent(
        @Body() createEventDto: CreateEventDto,
        @GetUser('id') userId: string
    ) {
        return this.scheduleService.createEvent(createEventDto, userId);
    }

    @Put('events/:id')
    async updateEvent(
        @Body() updateEventDto: UpdateEventDto,
        @Param('id') eventId: string,
        @GetUser('id') userId: string
    ) {
        return this.scheduleService.updateEvent(updateEventDto, userId, BigInt(eventId));
    }

    @Delete('events/:id')
    async deleteEvent(
        @Param('id') eventId: string,
        @GetUser('id') userId: string
    ) {
        return this.scheduleService.deleteEvent(BigInt(eventId), userId);
    }

    @Post('events/:id/exceptions')
    async addExceptionDate(
        @Param('id') eventId: string,
        @Body() dto: CreateEventExceptionDto,
        @GetUser('id') userId: string
    ) {
        // Ensure the event_id in body matches the param
        dto.event_id = BigInt(eventId);
        return this.scheduleService.addExDate(dto, userId);
    }

    @Post('events/:id/split')
    async modifyThisAndFollow(
        @Param('id') eventId: string,
        @Body() body: { recurrence_id: string; updates: UpdateEventDto },
        @GetUser('id') userId: string
    ) {
        return this.scheduleService.modifyThisAndFollow(
            BigInt(eventId),
            new Date(body.recurrence_id),
            body.updates,
            userId
        );
    }
}
