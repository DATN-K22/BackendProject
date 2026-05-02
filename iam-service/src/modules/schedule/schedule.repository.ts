import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Event } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
  CreateEventDto,
  CreateEventExceptionDto,
  EventExceptionResponseDto,
  EventWithRelationsDto,
  UpdateEventDto
} from './dto'

@Injectable()
export class ScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findEventById(eventId: bigint): Promise<Event | null> {
    return this.prisma.event.findUnique({
      where: { id: eventId }
    })
  }

  async findEventByIdWithRelations(eventId: bigint): Promise<EventWithRelationsDto | null> {
    return this.prisma.event.findUnique({
      where: { id: eventId },
      include: { exception_dates: true, exceptions: true }
    }) as Promise<EventWithRelationsDto | null>
  }

  async findEventsByName(title: string, userId: string): Promise<EventWithRelationsDto[]> {
    return this.prisma.event.findMany({
      where: {
        user_id: userId,
        title: { contains: title, mode: 'insensitive' }
      },
      include: { exception_dates: true, exceptions: true },
      orderBy: { time_start: 'asc' }
    }) as Promise<EventWithRelationsDto[]>
  }

  async findMySchedule(userId: string): Promise<EventWithRelationsDto[]> {
    return this.prisma.event.findMany({
      where: {
        user_id: userId
      },
      include: {
        exception_dates: true,
        exceptions: true
      },
      orderBy: {
        time_start: 'asc'
      }
    }) as Promise<EventWithRelationsDto[]>
  }

  async createEvent(createEventDto: CreateEventDto, userId: string): Promise<Event> {
    const timeStart = new Date(createEventDto.time_start)
    const timeEnd = new Date(createEventDto.time_end)

    return this.prisma.event.create({
      data: {
        user: {
          connect: { id: userId }
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
    })
  }

  async updateEvent(eventId: bigint, updateData: Record<string, unknown>): Promise<EventWithRelationsDto> {
    return this.prisma.event.update({
      where: {
        id: eventId
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
    }) as Promise<EventWithRelationsDto>
  }

  async addExceptionDate(dto: CreateEventExceptionDto): Promise<EventExceptionResponseDto> {
    const exceptionDate = new Date(dto.exception_date)

    return this.prisma.$transaction(async (tx) => {
      const modifiedInstance = await tx.event.findFirst({
        where: {
          original_event_id: dto.event_id,
          recurrence_id: exceptionDate
        }
      })

      if (modifiedInstance) {
        await tx.event.delete({
          where: { id: modifiedInstance.id }
        })
      }

      const exDate = await tx.eventExceptionDate.create({
        data: {
          exception_date: exceptionDate,
          reason: dto.reason,
          event: {
            connect: { id: dto.event_id }
          }
        }
      })

      await tx.event.update({
        where: { id: dto.event_id },
        data: {
          sequence: { increment: 1 },
          updated_at: new Date()
        }
      })

      return {
        ...exDate,
        reason: exDate.reason ?? undefined
      } as EventExceptionResponseDto
    })
  }

  async deleteEvent(eventId: bigint): Promise<{ message: string }> {
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({
        where: { id: eventId }
      })

      if (!event) {
        throw new NotFoundException('Event not found')
      }

      const eventToDelete = event.original_event_id || eventId

      await tx.event.deleteMany({
        where: { original_event_id: eventToDelete }
      })
      await tx.event.delete({
        where: { id: eventToDelete }
      })

      return {
        message: 'Event deleted successfully'
      }
    })
  }

  async splitRecurringSeries(params: {
    parentEventId: bigint
    parentRruleWithUntil: string
    splitDate: Date
    timeStart: Date
    timeEnd: Date
    title: string
    description: string | null | undefined
    location: string | null | undefined
    status: Event['status']
    timezone: string | null | undefined
    newRrule: string
    userId: string
  }): Promise<EventWithRelationsDto> {
    return this.prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: params.parentEventId },
        data: {
          rrule_string: params.parentRruleWithUntil,
          sequence: { increment: 1 },
          updated_at: new Date()
        }
      })

      await tx.event.deleteMany({
        where: {
          original_event_id: params.parentEventId,
          recurrence_id: { gte: params.splitDate }
        }
      })

      await tx.eventExceptionDate.deleteMany({
        where: {
          event_id: params.parentEventId,
          exception_date: { gte: params.splitDate }
        }
      })

      return (await tx.event.create({
        data: {
          user: { connect: { id: params.userId } },
          title: params.title,
          description: params.description,
          location: params.location,
          status: params.status,
          time_start: params.timeStart,
          time_end: params.timeEnd,
          timezone: params.timezone,
          rrule_string: params.newRrule,
          sequence: 0
        },
        include: { exception_dates: true, exceptions: true }
      })) as EventWithRelationsDto
    })
  }
}
