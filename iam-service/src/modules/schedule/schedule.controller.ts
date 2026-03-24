import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { CreateEventDto, CreateEventExceptionDto, UpdateEventDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiResponse } from '../../utils/dto/ApiResponse';

@Controller('schedule')
@UseGuards(JwtAuthGuard)
export class ScheduleController {
    constructor(private readonly scheduleService: ScheduleService) {}

    @Get()
    async getMySchedule(@GetUser('id') userId: string) {
        const data = await this.scheduleService.getMySchedule(userId);
        return ApiResponse.OkResponse(data, 'Schedule retrieved successfully');
    }

    @Get('events/search')
    async getEventsByName(
        @Query('title') title: string,
        @GetUser('id') userId: string
    ) {
        const data = await this.scheduleService.getEventsByName(title, userId);
        return ApiResponse.OkResponse(data, 'Events retrieved successfully');
    }

    @Get('events/:id')
    async getEventById(
        @Param('id') eventId: string,
        @GetUser('id') userId: string
    ) {
        const data = await this.scheduleService.getEventById(BigInt(eventId), userId);
        return ApiResponse.OkResponse(data, 'Event retrieved successfully');
    }

    @Post('events')
    async createEvent(
        @Body() createEventDto: CreateEventDto,
        @GetUser('id') userId: string
    ) {
        const data = await this.scheduleService.createEvent(createEventDto, userId);
        return ApiResponse.OkCreateResponse(data, 'Event created successfully');
    }

    @Put('events/:id')
    async updateEvent(
        @Body() updateEventDto: UpdateEventDto,
        @Param('id') eventId: string,
        @GetUser('id') userId: string
    ) {
        const data = await this.scheduleService.updateEvent(updateEventDto, userId, BigInt(eventId));
        return ApiResponse.OkResponse(data, 'Event updated successfully');
    }

    @Delete('events/:id')
    async deleteEvent(
        @Param('id') eventId: string,
        @GetUser('id') userId: string
    ) {
        const data = await this.scheduleService.deleteEvent(BigInt(eventId), userId);
        return ApiResponse.OkResponse(data, 'Event deleted successfully');
    }

    @Post('events/:id/exceptions')
    async addExceptionDate(
        @Param('id') eventId: string,
        @Body() dto: CreateEventExceptionDto,
        @GetUser('id') userId: string
    ) {
        // Ensure the event_id in body matches the param
        dto.event_id = BigInt(eventId);
        const data = await this.scheduleService.addExDate(dto, userId);
        return ApiResponse.OkCreateResponse(data, 'Exception date added successfully');
    }

    @Post('events/:id/split')
    async modifyThisAndFollow(
        @Param('id') eventId: string,
        @Body() body: { recurrence_id: string; updates: UpdateEventDto },
        @GetUser('id') userId: string
    ) {
        const data = await this.scheduleService.modifyThisAndFollow(
            BigInt(eventId),
            new Date(body.recurrence_id),
            body.updates,
            userId
        );
        return ApiResponse.OkResponse(data, 'Recurring event updated successfully');
    }
}
