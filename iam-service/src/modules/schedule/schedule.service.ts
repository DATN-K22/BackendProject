import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common'
import { Event } from '@prisma/client'
import {
  CreateEventDto,
  CreateEventExceptionDto,
  EventExceptionResponseDto,
  EventWithRelationsDto,
  UpdateEventDto
} from './dto'
import { ScheduleRepository } from './schedule.repository'

@Injectable()
export class ScheduleService {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}
  private readonly logger = new Logger(ScheduleService.name)

  private async AuthorizeEvent(event: { user_id: string } | null, user_id: string): Promise<void> {
    if (!event) {
      throw new NotFoundException('Original event not found')
    }

    if (event.user_id !== user_id) {
      throw new ForbiddenException('You do not have permission to create exceptions for this event')
    }
  }

  private async validateTimeRange(timeStart: Date, timeEnd: Date) {
    if (timeStart > timeEnd) {
      throw new BadRequestException('Start time must be before the end time')
    }
  }

  private addUntilToRRule(rruleString: string, untilDate: Date): string {
    const rruleWithoutPrefix = rruleString.replace(/^RRULE:/, '')
    const rruleParts = rruleWithoutPrefix.split(';').filter((part) => !part.startsWith('UNTIL='))
    const untilStr = untilDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    rruleParts.push(`UNTIL=${untilStr}`)
    return 'RRULE:' + rruleParts.join(';')
  }

  private removeUntilFromRRule(rrule: string): string {
    return rrule.replace(/;UNTIL=[^;]*/i, '').replace(/UNTIL=[^;]*;?/i, '')
  }

  private getUntilDateFromRRule(rrule: string): Date | null {
    const match = rrule.match(/UNTIL=([^;]+)/i)
    if (match) {
      const untilStr = match[1]
      const year = parseInt(untilStr.slice(0, 4), 10)
      const month = parseInt(untilStr.slice(4, 6), 10) - 1
      const day = parseInt(untilStr.slice(6, 8), 10)
      const hour = parseInt(untilStr.slice(9, 11), 10)
      const minute = parseInt(untilStr.slice(11, 13), 10)
      const second = parseInt(untilStr.slice(13, 15), 10)
      return new Date(Date.UTC(year, month, day, hour, minute, second))
    }
    return null
  }

  private async createNewEvent(createEventDto: CreateEventDto, user_id: string): Promise<Event> {
    const timeStart = new Date(createEventDto.time_start)
    const timeEnd = new Date(createEventDto.time_end)
    await this.validateTimeRange(timeStart, timeEnd)

    if (createEventDto.original_event_id) {
      const originalEvent = await this.scheduleRepository.findEventById(createEventDto.original_event_id)
      await this.AuthorizeEvent(originalEvent, user_id)

      if (!originalEvent?.rrule_string) {
        throw new BadRequestException('Cannot create exception for non-recurring event')
      }
    }

    if (createEventDto.rrule_string) {
      if (!createEventDto.rrule_string.startsWith('RRULE:')) {
        throw new BadRequestException('Invalid RRULE format: must start with "RRULE:"')
      }
    }

    return this.scheduleRepository.createEvent(createEventDto, user_id)
  }

  /**
   * Retrieves a single event by its ID, validates ownership.
   */
  async getEventById(event_id: bigint, user_id: string): Promise<EventWithRelationsDto> {
    const event = await this.scheduleRepository.findEventByIdWithRelations(event_id)
    await this.AuthorizeEvent(event, user_id)
    return event as EventWithRelationsDto
  }

  /**
   * Searches events by title (case-insensitive partial match) for a given user.
   */
  async getEventsByName(title: string, user_id: string): Promise<EventWithRelationsDto[]> {
    return this.scheduleRepository.findEventsByName(title, user_id)
  }

  /**
   * Retrieves all events belonging to a user, ordered by start time ascending.
   * Use this to fetch the full raw schedule before applying date-range filters.
   */
  async getMySchedule(user_id: string): Promise<EventWithRelationsDto[]> {
    try {
      return await this.scheduleRepository.findMySchedule(user_id)
    } catch (error: any) {
      this.logger.error('Error fetching user schedule:', error)
      throw error
    }
  }
  /**
   * Creates a new calendar event for the given user.
   * Supports both one-time and recurring events (via `rrule_string`).
   * If `original_event_id` is provided, creates a modified exception instance of a recurring series.
   */
  async createEvent(createEventDto: CreateEventDto, user_id: string): Promise<EventWithRelationsDto> {
    try {
      const event = await this.createNewEvent(createEventDto, user_id)
      return event as unknown as EventWithRelationsDto
    } catch (error: any) {
      this.logger.error('Error creating event:', error)
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error
      }
      if (error.code === 'P2002') {
        throw new BadRequestException('Event with this UID already exists')
      }
      if (error.code === 'P2003') {
        throw new BadRequestException('Referenced resource not found')
      }
      throw new BadRequestException('Failed to create event')
    }
  }

  /**
   * Updates fields on an existing event. Only provided fields are changed (partial update).
   * Validates ownership and time range. Increments the sequence number on each update.
   */
  async updateEvent(updateEventDto: UpdateEventDto, user_id: string, event_id: bigint): Promise<unknown> {
    try {
      const existingEvent = await this.scheduleRepository.findEventById(event_id)

      await this.AuthorizeEvent(existingEvent, user_id)
      if (!existingEvent) {
        throw new NotFoundException('Event not found')
      }

      const timeStart = updateEventDto.time_start ? new Date(updateEventDto.time_start) : existingEvent.time_start
      const timeEnd = updateEventDto.time_end ? new Date(updateEventDto.time_end) : existingEvent.time_end

      await this.validateTimeRange(timeStart, timeEnd)

      // Validate RRULE format if provided
      if (updateEventDto.rrule_string && !updateEventDto.rrule_string.startsWith('RRULE:')) {
        throw new BadRequestException('Invalid RRULE format: must start with "RRULE:"')
      }

      // Only allow mutable event fields from update payload.
      // This prevents leaking auth/tool metadata (e.g. userId/user_id) into Prisma update data.
      const { title, description, location, status, time_start, time_end, timezone, rrule_string, recurrence_id } =
        updateEventDto as Record<string, unknown>

      const updateFields: Record<string, unknown> = {
        title,
        description,
        location,
        status,
        time_start,
        time_end,
        timezone,
        rrule_string,
        recurrence_id
      }
      const updateData: Record<string, unknown> = {}

      for (const [key, value] of Object.entries(updateFields)) {
        if (value === undefined) continue

        if (key === 'time_start' || key === 'time_end') {
          updateData[key] = new Date(value as string)
        } else if (key === 'recurrence_id') {
          updateData[key] = value ? new Date(value as string) : null
        } else {
          updateData[key] = value
        }
      }

      const event = await this.scheduleRepository.updateEvent(event_id, updateData)

      return {
        message: 'Event updated successfully',
        event: event as EventWithRelationsDto
      }
    } catch (error: any) {
      this.logger.error('Error updating event:', error)
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Event not found')
      }
      throw new BadRequestException('Failed to update event')
    }
  }

  /**
   * Adds an exception date (EXDATE) to a recurring event, effectively skipping that occurrence.
   * If a modified instance already exists for that recurrence date, it is deleted first.
   * Only applicable to recurring events with an `rrule_string`.
   */
  async addExDate(dto: CreateEventExceptionDto, user_id: string): Promise<EventExceptionResponseDto> {
    try {
      const originalEvent = await this.scheduleRepository.findEventById(dto.event_id)
      await this.AuthorizeEvent(originalEvent, user_id)
      if (!originalEvent?.rrule_string) {
        throw new BadRequestException('Cannot create exception for non-recurring event')
      }
      return await this.scheduleRepository.addExceptionDate(dto)
    } catch (error: any) {
      this.logger.error('Error adding exception date:', error)
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error
      }
      if (error.code === 'P2002') {
        throw new BadRequestException('Exception date already exists for this event')
      }
      if (error.code === 'P2003') {
        throw new NotFoundException('Event not found')
      }
      throw new BadRequestException('Failed to add exception date')
    }
  }

  /**
   * Deletes an event and its entire recurrence series (cascades to all child exceptions).
   * If a modified instance is passed, the parent series is deleted instead.
   * Validates ownership before deletion.
   */
  async deleteEvent(event_id: bigint, user_id: string): Promise<{ message: string }> {
    try {
      const event = await this.scheduleRepository.findEventById(event_id)
      await this.AuthorizeEvent(event, user_id)

      const eventToDelete = event?.original_event_id || event_id

      if (event?.original_event_id) {
        const parentEvent = await this.scheduleRepository.findEventById(event.original_event_id)
        await this.AuthorizeEvent(parentEvent, user_id)
      }

      return await this.scheduleRepository.deleteEvent(eventToDelete)
    } catch (error: any) {
      this.logger.error('Error deleting event:', error)
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Event not found')
      }
      throw new BadRequestException('Failed to delete event')
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
      const currentEvent = await this.scheduleRepository.findEventById(event_id)
      if (!currentEvent) throw new NotFoundException('Event not found')
      await this.AuthorizeEvent(currentEvent, user_id)

      const parentEventId = currentEvent.original_event_id || currentEvent.id
      const parentEvent = await this.scheduleRepository.findEventById(parentEventId)

      // Fix 4 — null check
      if (!parentEvent) throw new NotFoundException('Parent event not found')
      if (!parentEvent.rrule_string) throw new BadRequestException('Cannot split non-recurring event')

      const existingUntil = this.getUntilDateFromRRule(parentEvent.rrule_string)
      if (existingUntil && existingUntil < recurrence_id) {
        throw new BadRequestException('Recurrence ID is after the existing UNTIL date of the series')
      }

      const splitDate = new Date(recurrence_id)

      if (updateEventDto.rrule_string && !updateEventDto.rrule_string.startsWith('RRULE:')) {
        throw new BadRequestException('Invalid RRULE format: must start with "RRULE:"')
      }

      // Fix 1 — untilDate đúng là end of day trước splitDate
      const untilDate = new Date(splitDate)
      untilDate.setDate(untilDate.getDate() - 1)
      untilDate.setUTCHours(23, 59, 59, 999)

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
              parentEvent.time_start.getUTCSeconds()
            )
          )

      const timeEnd = updateEventDto.time_end
        ? new Date(updateEventDto.time_end)
        : new Date(timeStart.getTime() + (parentEvent.time_end.getTime() - parentEvent.time_start.getTime()))

      await this.validateTimeRange(timeStart, timeEnd)
      const requestedRrule = updateEventDto.rrule_string ?? parentEvent.rrule_string
      const newRrule = this.removeUntilFromRRule(requestedRrule)

      return await this.scheduleRepository.splitRecurringSeries({
        parentEventId,
        parentRruleWithUntil: this.addUntilToRRule(parentEvent.rrule_string, untilDate),
        splitDate,
        timeStart,
        timeEnd,
        title: (updateEventDto.title ?? parentEvent.title) as string,
        description: updateEventDto.description ?? parentEvent.description ?? undefined,
        location: updateEventDto.location ?? parentEvent.location ?? undefined,
        status: (updateEventDto.status ?? parentEvent.status) as Event['status'],
        timezone: updateEventDto.timezone ?? parentEvent.timezone ?? undefined,
        newRrule: existingUntil && existingUntil > splitDate ? this.addUntilToRRule(newRrule, existingUntil) : newRrule,
        userId: user_id
      })
    } catch (error: any) {
      this.logger.error('Error modifying this and future events:', error)
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Event not found')
      }
      throw new BadRequestException('Failed to modify this and future events')
    }
  }
}
