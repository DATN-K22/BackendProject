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

    async createEvent(createEventDto: CreateEventDto, user_id: string): Promise<EventWithRelationsDto> {
        try {
            const timeStart = new Date(createEventDto.time_start);
            const timeEnd = new Date(createEventDto.time_end);
            this.validateTimeRange(timeStart, timeEnd);

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
                    rrule_string: createEventDto.rrule_string,
                    recurrence_id: createEventDto.recurrence_id ? new Date(createEventDto.recurrence_id) : null,
                    ...(createEventDto.original_event_id && {
                        event: {
                            connect: { id: createEventDto.original_event_id }
                        }
                    })
                },
                include: {
                    exception_dates: true,
                    exceptions: true
                }
            });
            return event as EventWithRelationsDto;
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

    async updateEvent (updateEventDto: UpdateEventDto, user_id: string): Promise <unknown>{
        try {
            const existingEvent = await this.prisma.event.findUnique({
                where: { id: updateEventDto.id }
            });

            this.AuthorizeEvent(existingEvent, user_id);

            const timeStart = updateEventDto.time_start ? new Date(updateEventDto.time_start) : existingEvent.time_start;
            const timeEnd = updateEventDto.time_end ? new Date(updateEventDto.time_end) : existingEvent.time_end;  

            this.validateTimeRange(timeStart, timeEnd);

            // Validate RRULE format if provided
            if (updateEventDto.rrule_string && !updateEventDto.rrule_string.startsWith('RRULE:')) {
                throw new BadRequestException('Invalid RRULE format: must start with "RRULE:"');
            }

            const { id, ...updateFields } = updateEventDto;
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
                    id: updateEventDto.id
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

    async modifyThisAndFollow( event_id: bigint, recurrence_id: Date, updateEventDto: UpdateEventDto, user_id: string): Promise<EventWithRelationsDto> {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const currentEvent = await tx.event.findUnique({ where: { id: event_id } });
                if (!currentEvent) throw new NotFoundException('Event not found');
                await this.AuthorizeEvent(currentEvent, user_id);

                const parentEventId = currentEvent.original_event_id || currentEvent.id;
                const parentEvent = await tx.event.findUnique({ where: { id: parentEventId } });
                if (!parentEvent.rrule_string) {
                    throw new BadRequestException('Cannot split non-recurring event');
                }

                const splitDate = new Date(recurrence_id);
                const untilDate = new Date(splitDate);
                untilDate.setDate(untilDate.getDate() - 1);
                
                await tx.event.update({
                    where: { id: parentEventId },
                    data: { 
                        rrule_string: this.addUntilToRRule(parentEvent.rrule_string, untilDate),
                        sequence: { increment: 1 },
                        updated_at: new Date()
                    }
                });
                await tx.event.deleteMany({
                    where: { original_event_id: parentEventId, recurrence_id: { gte: splitDate } }
                });
                await tx.eventExceptionDate.deleteMany({
                    where: { event_id: parentEventId, exception_date: { gte: splitDate } }
                });

                const timeStart = updateEventDto.time_start ? new Date(updateEventDto.time_start) : splitDate;
                const timeEnd = updateEventDto.time_end ? new Date(updateEventDto.time_end) : 
                    new Date(splitDate.getTime() + (parentEvent.time_end.getTime() - parentEvent.time_start.getTime()));
                await this.validateTimeRange(timeStart, timeEnd);

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
                        rrule_string: parentEvent.rrule_string,
                    },
                    include: { exception_dates: true, exceptions: true }
                }) as EventWithRelationsDto;
            });
        } catch (error) {
            console.error('Error modifying this and future events:', error);
            if (error instanceof BadRequestException || 
                error instanceof NotFoundException || 
                error instanceof ForbiddenException) {
                throw error;
            }
            if (error.code === 'P2025') {
                throw new NotFoundException('Event not found');
            }
            throw new BadRequestException('Failed to modify this and future events');
        }
    }

}
