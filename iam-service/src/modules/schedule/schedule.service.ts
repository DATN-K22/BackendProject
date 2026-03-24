import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto, CreateEventExceptionDto, EventExceptionResponseDto, EventWithRelationsDto, UpdateEventDto } from './dto';
import { Event } from '@prisma/client';


@Injectable()
export class ScheduleService {
    constructor (private readonly prisma: PrismaService){}

    private async AuthorizeEvent(event: Event | null, user_id: string): Promise<void> {
        if (!event) {
            throw new NotFoundException('Original event not found');
        }

        if (event.user_id !== user_id) {
            throw new ForbiddenException('You do not have permission to create exceptions for this event');
        }        

    }

    private async validateTimeRange(timeStart: Date, timeEnd: Date){
        if (timeStart > timeEnd){
            throw new BadRequestException('Start time must be before the end time');
        }
    }

    private addUntilToRRule(rruleString: string, untilDate: Date): string {
        const rruleWithoutPrefix = rruleString.replace(/^RRULE:/, '');
        const rruleParts = rruleWithoutPrefix.split(';').filter(part => !part.startsWith('UNTIL='));
        const untilStr = untilDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        rruleParts.push(`UNTIL=${untilStr}`);
        return 'RRULE:' + rruleParts.join(';');
    }

    private removeUntilFromRRule(rrule: string): string {
        return rrule
            .replace(/;UNTIL=[^;]*/i, '')
            .replace(/UNTIL=[^;]*;?/i, '');
    }

    private async createNewEvent(createEventDto: CreateEventDto, user_id: string): Promise<Event> {
            const timeStart = new Date(createEventDto.time_start);
            const timeEnd = new Date(createEventDto.time_end);
            await this.validateTimeRange(timeStart, timeEnd);

            if (createEventDto.original_event_id) {
                const originalEvent = await this.prisma.event.findUnique({
                    where: { id: createEventDto.original_event_id }
                });
                this.AuthorizeEvent(originalEvent, user_id);

                if (!originalEvent.rrule_string) {
                    throw new BadRequestException('Cannot create exception for non-recurring event');
                }
            }

            if (createEventDto.rrule_string) {
                if (!createEventDto.rrule_string.startsWith('RRULE:')) {
                    throw new BadRequestException('Invalid RRULE format: must start with "RRULE:"');
                }
            }

            const event = await this.prisma.event.create({
                data: {
                    user: {
                        connect: { id: user_id }
                    },
                    title: createEventDto.title,
                    description: createEventDto.description,
                    location: createEventDto.location,
                    status: createEventDto.status ?? 'CONFIRMED',
                    time_start: timeStart,
                    time_end: timeEnd,
                    timezone: createEventDto.timezone ?? 'UTC',
                    rrule_string: createEventDto.original_event_id ? null : createEventDto.rrule_string,
                    recurrence_id: createEventDto.recurrence_id ? new Date(createEventDto.recurrence_id) : null,
                    ...(createEventDto.original_event_id && {
                        original_event: {
                            connect: { id: createEventDto.original_event_id }
                        }
                    })
                },
                include: {
                    exception_dates: true,
                    exceptions: true
                }
            });
            return event
    }



    /**
     * Retrieves a single event by its ID, validates ownership.
     */
    async getEventById(event_id: bigint, user_id: string): Promise<EventWithRelationsDto> {
        const event = await this.prisma.event.findUnique({
            where: { id: event_id },
            include: { exception_dates: true, exceptions: true }
        });
        await this.AuthorizeEvent(event, user_id);
        return event as EventWithRelationsDto;
    }

    /**
     * Searches events by title (case-insensitive partial match) for a given user.
     */
    async getEventsByName(title: string, user_id: string): Promise<EventWithRelationsDto[]> {
        const events = await this.prisma.event.findMany({
            where: {
                user_id,
                title: { contains: title, mode: 'insensitive' }
            },
            include: { exception_dates: true, exceptions: true },
            orderBy: { time_start: 'asc' }
        });
        return events as EventWithRelationsDto[];
    }

    /**
     * Retrieves all events belonging to a user, ordered by start time ascending.
     * Use this to fetch the full raw schedule before applying date-range filters.
     */
    async getMySchedule(user_id: string): Promise<EventWithRelationsDto[]> {
        try {
            const events = await this.prisma.event.findMany({
                where: {
                    user_id: user_id
                },
                include: {
                    exception_dates: true,
                    exceptions: true
                },
                orderBy: {
                    time_start: 'asc'
                }
            });

            return events as EventWithRelationsDto[];
        } catch (error) {
            console.error('Error fetching user schedule:', error);
            throw error;
        }
    }
    /**
     * Creates a new calendar event for the given user.
     * Supports both one-time and recurring events (via `rrule_string`).
     * If `original_event_id` is provided, creates a modified exception instance of a recurring series.
     */
    async createEvent(createEventDto: CreateEventDto, user_id: string): Promise<EventWithRelationsDto> {
        try {
            const event = await this.createNewEvent(createEventDto, user_id);
            return event as unknown as EventWithRelationsDto;
        } catch (error) {
            console.error('Error creating event:', error);
            if (error instanceof BadRequestException || error instanceof NotFoundException 
                || error instanceof ForbiddenException) {
                throw error;
            }
            if (error.code === 'P2002') {
                throw new BadRequestException('Event with this UID already exists');
            }
            if (error.code === 'P2003') {
                throw new BadRequestException('Referenced resource not found');
            }
            throw new BadRequestException('Failed to create event');
        }
    }
    
    /**
     * Updates fields on an existing event. Only provided fields are changed (partial update).
     * Validates ownership and time range. Increments the sequence number on each update.
     */
    async updateEvent (updateEventDto: UpdateEventDto, user_id: string, event_id: bigint): Promise <unknown>{
        try {
            const existingEvent = await this.prisma.event.findUnique({
                where: { id: event_id }
            });

            await this.AuthorizeEvent(existingEvent, user_id);

            const timeStart = updateEventDto.time_start ? new Date(updateEventDto.time_start) : existingEvent.time_start;
            const timeEnd = updateEventDto.time_end ? new Date(updateEventDto.time_end) : existingEvent.time_end;  

            await this.validateTimeRange(timeStart, timeEnd);

            // Validate RRULE format if provided
            if (updateEventDto.rrule_string && !updateEventDto.rrule_string.startsWith('RRULE:')) {
                throw new BadRequestException('Invalid RRULE format: must start with "RRULE:"');
            }

            const updateFields  = updateEventDto;
            const updateData: any = {};

            for (const [key, value] of Object.entries(updateFields)) {
                if (value === undefined) continue; 
                
                if (key === 'time_start' || key === 'time_end') {
                    updateData[key] = new Date(value as string);
                } else if (key === 'recurrence_id') {
                    updateData[key] = value ? new Date(value as string) : null;
                } else {
                    updateData[key] = value;
                }
            }

            const event = await this.prisma.event.update({
                where: {
                    id: event_id
                },
                data: {
                    ...updateData,
                    sequence: { increment: 1 },
                    updated_at: new Date()

                },
                include: {
                    exception_dates: true,
                    exceptions: true
                }
            });

            return {
                message: "Event updated successfully",
                event: event as EventWithRelationsDto
            }
        } catch (error) {
            console.error('Error updating event:', error);
            if (error instanceof BadRequestException || 
                error instanceof NotFoundException || 
                error instanceof ForbiddenException) {
                throw error;
            }
            if (error.code === 'P2025') {
                throw new NotFoundException('Event not found');
            }
            throw new BadRequestException('Failed to update event');
        }

    }

    /**
     * Adds an exception date (EXDATE) to a recurring event, effectively skipping that occurrence.
     * If a modified instance already exists for that recurrence date, it is deleted first.
     * Only applicable to recurring events with an `rrule_string`.
     */
    async addExDate(dto: CreateEventExceptionDto, user_id: string): Promise<EventExceptionResponseDto> {
        try {
            const originalEvent = await this.prisma.event.findUnique({
                where: { id: dto.event_id }
            });
            await this.AuthorizeEvent(originalEvent, user_id);
            if (!originalEvent.rrule_string) {
                throw new BadRequestException('Cannot create exception for non-recurring event');
            }
            const exceptionDate = new Date(dto.exception_date);
            return await this.prisma.$transaction(async (tx) => {
                const modifiedInstance = await tx.event.findFirst({
                    where: {
                        original_event_id: dto.event_id,
                        recurrence_id: exceptionDate
                    }
                });

                if (modifiedInstance) {
                    await tx.event.delete({
                        where: { id: modifiedInstance.id }
                    });
                }

                const exDate = await tx.eventExceptionDate.create({
                    data: {
                        exception_date: exceptionDate,
                        reason: dto.reason,
                        event: {
                            connect: { id: dto.event_id }
                        }
                    }
                });
                await tx.event.update({
                    where: { id: dto.event_id },
                    data: {
                        sequence: { increment: 1 },
                        updated_at: new Date()
                    }
                });
                return exDate;
            });
        } catch (error) {
            console.error('Error adding exception date:', error);
            if (error instanceof BadRequestException || 
                error instanceof NotFoundException || 
                error instanceof ForbiddenException) {
                throw error;
            }
            if (error.code === 'P2002') {
                throw new BadRequestException('Exception date already exists for this event');
            }
            if (error.code === 'P2003') {
                throw new NotFoundException('Event not found');
            }
            throw new BadRequestException('Failed to add exception date');
        }
    }
    

    /**
     * Deletes an event and its entire recurrence series (cascades to all child exceptions).
     * If a modified instance is passed, the parent series is deleted instead.
     * Validates ownership before deletion.
     */
    async deleteEvent(event_id: bigint, user_id: string): Promise<{ message: string }> {
        try {
            const event = await this.prisma.event.findUnique({
                where: { id: event_id }
            });

            await this.AuthorizeEvent(event, user_id);

            // If this is a child/modified instance, find the parent to delete the entire series
            const eventToDelete = event.original_event_id || event_id;

            // If we're deleting a different event (parent), authorize it too
            if (event.original_event_id) {
                const parentEvent = await this.prisma.event.findUnique({
                    where: { id: event.original_event_id }
                });
                await this.AuthorizeEvent(parentEvent, user_id);
            }

            // Delete the parent event - Prisma cascades to all children
            await this.prisma.event.delete({
                where: { id: eventToDelete }
            });

            return {
                message: 'Event deleted successfully'
            };
        } catch (error) {
            console.error('Error deleting event:', error);
            if (error instanceof NotFoundException || 
                error instanceof ForbiddenException) {
                throw error;
            }
            if (error.code === 'P2025') {
                throw new NotFoundException('Event not found');
            }
            throw new BadRequestException('Failed to delete event');
        }
    }

    /**
     * Splits a recurring series at `recurrence_id` and applies updates to all occurrences from that point forward.
     * The original series is capped with an UNTIL rule, future modified instances and exception dates are cleared,
     * and a new event series starting at `recurrence_id` is created with the updated fields.
     */
    async modifyThisAndFollow(
        event_id: bigint,
        recurrence_id: Date,
        updateEventDto: UpdateEventDto,
        user_id: string
    ): Promise<EventWithRelationsDto> {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const currentEvent = await tx.event.findUnique({ where: { id: event_id } });
                if (!currentEvent) throw new NotFoundException('Event not found');
                await this.AuthorizeEvent(currentEvent, user_id);

                const parentEventId = currentEvent.original_event_id || currentEvent.id;
                const parentEvent = await tx.event.findUnique({ where: { id: parentEventId } });
                
                // Fix 4 — null check
                if (!parentEvent) throw new NotFoundException('Parent event not found');
                if (!parentEvent.rrule_string) throw new BadRequestException('Cannot split non-recurring event');

                const splitDate = new Date(recurrence_id);

                // Fix 1 — untilDate đúng là end of day trước splitDate
                const untilDate = new Date(splitDate);
                untilDate.setDate(untilDate.getDate() - 1);
                untilDate.setUTCHours(23, 59, 59, 999);

                // Cắt chuỗi cũ tại untilDate
                await tx.event.update({
                    where: { id: parentEventId },
                    data: {
                        rrule_string: this.addUntilToRRule(parentEvent.rrule_string, untilDate),
                        sequence: { increment: 1 },
                        updated_at: new Date(),
                    }
                });

                // Xóa overrides và exceptions từ splitDate trở đi
                await tx.event.deleteMany({
                    where: {
                        original_event_id: parentEventId,
                        recurrence_id: { gte: splitDate },
                    }
                });
                await tx.eventExceptionDate.deleteMany({
                    where: {
                        event_id: parentEventId,
                        exception_date: { gte: splitDate },
                    }
                });

                // Fix 2 — giữ nguyên giờ từ parent nếu user không đổi
                const timeStart = updateEventDto.time_start
                    ? new Date(updateEventDto.time_start)
                    : new Date(
                        Date.UTC(
                            splitDate.getUTCFullYear(),
                            splitDate.getUTCMonth(),
                            splitDate.getUTCDate(),
                            parentEvent.time_start.getUTCHours(),
                            parentEvent.time_start.getUTCMinutes(),
                            parentEvent.time_start.getUTCSeconds(),
                        )
                    );

                const timeEnd = updateEventDto.time_end
                    ? new Date(updateEventDto.time_end)
                    : new Date(
                        timeStart.getTime() +
                        (parentEvent.time_end.getTime() - parentEvent.time_start.getTime())
                    );

                await this.validateTimeRange(timeStart, timeEnd);

                // Fix 3 & 5 — strip UNTIL khỏi rrule mới, reset sequence
                return await tx.event.create({
                    data: {
                        user: { connect: { id: user_id } },
                        title: updateEventDto.title ?? parentEvent.title,
                        description: updateEventDto.description ?? parentEvent.description,
                        location: updateEventDto.location ?? parentEvent.location,
                        status: updateEventDto.status ?? parentEvent.status,
                        time_start: timeStart,
                        time_end: timeEnd,
                        timezone: updateEventDto.timezone ?? parentEvent.timezone,
                        rrule_string: this.removeUntilFromRRule(parentEvent.rrule_string),
                        sequence: 0,
                    },
                    include: { exception_dates: true, exceptions: true }
                }) as EventWithRelationsDto;
            });
        } catch (error) {
            console.error('Error modifying this and future events:', error);
            if (
                error instanceof BadRequestException ||
                error instanceof NotFoundException ||
                error instanceof ForbiddenException
            ) {
                throw error;
            }
            if (error.code === 'P2025') {
                throw new NotFoundException('Event not found');
            }
            throw new BadRequestException('Failed to modify this and future events');
        }
    }


}
