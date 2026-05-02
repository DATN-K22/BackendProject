// src/unit-tests/schedule/schedule.service.spec.ts

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(),
  EventStatus: {
    CONFIRMED: 'CONFIRMED',
    TENTATIVE: 'TENTATIVE',
    CANCELLED: 'CANCELLED'
  }
}))

import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common'
import { ScheduleService } from '../../modules/schedule/schedule.service'
import { ScheduleRepository } from '../../modules/schedule/schedule.repository'
import { CreateEventDto, CreateEventExceptionDto, UpdateEventDto } from '../../modules/schedule/dto'

const userId = 'user-123'

const mockEvent = {
  id: 1n,
  user_id: userId,
  uid: 'uid-1',
  title: 'Team Meeting',
  description: 'Weekly sync',
  location: 'Office',
  status: 'CONFIRMED',
  time_start: new Date('2024-01-01T10:00:00Z'),
  time_end: new Date('2024-01-01T11:00:00Z'),
  timezone: 'UTC',
  rrule_string: 'RRULE:FREQ=WEEKLY',
  sequence: 0,
  recurrence_id: null,
  original_event_id: null,
  created_at: new Date(),
  updated_at: new Date(),
  exception_dates: [],
  exceptions: []
}

const mockRepository = {
  findEventById: jest.fn(),
  findEventByIdWithRelations: jest.fn(),
  findEventsByName: jest.fn(),
  findMySchedule: jest.fn(),
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
  addExceptionDate: jest.fn(),
  deleteEvent: jest.fn(),
  splitRecurringSeries: jest.fn()
}

describe('ScheduleService', () => {
  let service: ScheduleService

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScheduleService, { provide: ScheduleRepository, useValue: mockRepository }]
    }).compile()

    service = module.get<ScheduleService>(ScheduleService)
    jest.clearAllMocks()
  })

  describe('getMySchedule', () => {
    it('should return all events for user ordered by time_start', async () => {
      mockRepository.findMySchedule.mockResolvedValue([mockEvent])

      const result = await service.getMySchedule(userId)

      expect(mockRepository.findMySchedule).toHaveBeenCalledWith(userId)
      expect(result).toEqual([mockEvent])
    })

    it('should propagate unexpected errors', async () => {
      mockRepository.findMySchedule.mockRejectedValue(new Error('DB error'))

      await expect(service.getMySchedule(userId)).rejects.toThrow('DB error')
    })
  })

  describe('getEventsByName', () => {
    it('should return events matching title for user', async () => {
      mockRepository.findEventsByName.mockResolvedValue([mockEvent])

      const result = await service.getEventsByName('Meeting', userId)

      expect(mockRepository.findEventsByName).toHaveBeenCalledWith('Meeting', userId)
      expect(result).toEqual([mockEvent])
    })
  })

  describe('getEventById', () => {
    it('should return event when found and user is owner', async () => {
      mockRepository.findEventByIdWithRelations.mockResolvedValue(mockEvent)

      const result = await service.getEventById(1n, userId)

      expect(mockRepository.findEventByIdWithRelations).toHaveBeenCalledWith(1n)
      expect(result).toEqual(mockEvent)
    })

    it('should throw NotFoundException when event not found', async () => {
      mockRepository.findEventByIdWithRelations.mockResolvedValue(null)

      await expect(service.getEventById(999n, userId)).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException when user does not own event', async () => {
      mockRepository.findEventByIdWithRelations.mockResolvedValue({ ...mockEvent, user_id: 'other-user' })

      await expect(service.getEventById(1n, userId)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('createEvent', () => {
    const dto: CreateEventDto = {
      title: 'New Meeting',
      time_start: '2024-01-01T10:00:00Z',
      time_end: '2024-01-01T11:00:00Z'
    } as CreateEventDto

    it('should create a simple event successfully', async () => {
      mockRepository.createEvent.mockResolvedValue(mockEvent)

      const result = await service.createEvent(dto, userId)

      expect(mockRepository.createEvent).toHaveBeenCalledWith(dto, userId)
      expect(result).toEqual(mockEvent)
    })

    it('should throw BadRequestException when time_start is after time_end', async () => {
      const invalidDto: CreateEventDto = {
        title: 'Bad Event',
        time_start: '2024-01-01T12:00:00Z',
        time_end: '2024-01-01T10:00:00Z'
      } as CreateEventDto

      await expect(service.createEvent(invalidDto, userId)).rejects.toThrow('Start time must be before the end time')
    })

    it('should throw BadRequestException for invalid RRULE format', async () => {
      const invalidDto: CreateEventDto = {
        ...dto,
        rrule_string: 'FREQ=WEEKLY'
      } as CreateEventDto

      await expect(service.createEvent(invalidDto, userId)).rejects.toThrow(
        'Invalid RRULE format: must start with "RRULE:"'
      )
    })

    it('should throw BadRequestException when creating exception for non-recurring event', async () => {
      const exceptionDto: CreateEventDto = {
        ...dto,
        original_event_id: 2n
      } as CreateEventDto

      mockRepository.findEventById.mockResolvedValue({ ...mockEvent, rrule_string: null })

      await expect(service.createEvent(exceptionDto, userId)).rejects.toThrow(
        'Cannot create exception for non-recurring event'
      )
    })
  })

  describe('updateEvent', () => {
    const dto: UpdateEventDto = { title: 'Updated Title' } as UpdateEventDto

    it('should update event successfully', async () => {
      const updatedEvent = { ...mockEvent, title: 'Updated Title', sequence: 1 }
      mockRepository.findEventById.mockResolvedValue(mockEvent)
      mockRepository.updateEvent.mockResolvedValue(updatedEvent)

      const result = (await service.updateEvent(dto, userId, 1n)) as any

      expect(mockRepository.findEventById).toHaveBeenCalledWith(1n)
      expect(mockRepository.updateEvent).toHaveBeenCalledWith(1n, expect.objectContaining({ title: 'Updated Title' }))
      expect(result.event.title).toBe('Updated Title')
    })

    it('should throw NotFoundException when event does not exist', async () => {
      mockRepository.findEventById.mockResolvedValue(null)

      await expect(service.updateEvent(dto, userId, 999n)).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException when user does not own event', async () => {
      mockRepository.findEventById.mockResolvedValue({ ...mockEvent, user_id: 'other-user' })

      await expect(service.updateEvent(dto, userId, 1n)).rejects.toThrow(ForbiddenException)
    })

    it('should throw BadRequestException when updated times are invalid', async () => {
      const invalidDto: UpdateEventDto = {
        time_start: '2024-01-01T12:00:00Z',
        time_end: '2024-01-01T10:00:00Z'
      } as UpdateEventDto
      mockRepository.findEventById.mockResolvedValue(mockEvent)

      await expect(service.updateEvent(invalidDto, userId, 1n)).rejects.toThrow(
        'Start time must be before the end time'
      )
    })
  })

  describe('addExDate', () => {
    const dto: CreateEventExceptionDto = {
      event_id: 1n,
      exception_date: '2024-01-15T00:00:00Z'
    } as unknown as CreateEventExceptionDto

    it('should add exception date successfully', async () => {
      const mockExDate = {
        id: 10n,
        event_id: 1n,
        exception_date: new Date('2024-01-15T00:00:00Z'),
        reason: null
      }
      mockRepository.findEventById.mockResolvedValue(mockEvent)
      mockRepository.addExceptionDate.mockResolvedValue(mockExDate)

      const result = await service.addExDate(dto, userId)

      expect(mockRepository.findEventById).toHaveBeenCalledWith(1n)
      expect(mockRepository.addExceptionDate).toHaveBeenCalledWith(dto)
      expect(result).toMatchObject({ id: 10n, event_id: 1n })
    })

    it('should throw NotFoundException when event not found', async () => {
      mockRepository.findEventById.mockResolvedValue(null)

      await expect(service.addExDate(dto, userId)).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException when user does not own event', async () => {
      mockRepository.findEventById.mockResolvedValue({ ...mockEvent, user_id: 'other-user' })

      await expect(service.addExDate(dto, userId)).rejects.toThrow(ForbiddenException)
    })

    it('should throw BadRequestException for non-recurring event', async () => {
      mockRepository.findEventById.mockResolvedValue({ ...mockEvent, rrule_string: null })

      await expect(service.addExDate(dto, userId)).rejects.toThrow('Cannot create exception for non-recurring event')
    })
  })

  describe('deleteEvent', () => {
    it('should delete event and its series successfully', async () => {
      mockRepository.findEventById.mockResolvedValue(mockEvent)
      mockRepository.deleteEvent.mockResolvedValue({ message: 'Event deleted successfully' })

      const result = await service.deleteEvent(1n, userId)

      expect(mockRepository.findEventById).toHaveBeenCalledWith(1n)
      expect(mockRepository.deleteEvent).toHaveBeenCalledWith(1n)
      expect(result).toEqual({ message: 'Event deleted successfully' })
    })

    it('should delete parent series when deleting a child exception instance', async () => {
      const childEvent = { ...mockEvent, id: 5n, original_event_id: 1n }
      mockRepository.findEventById.mockResolvedValueOnce(childEvent).mockResolvedValueOnce(mockEvent)
      mockRepository.deleteEvent.mockResolvedValue({ message: 'Event deleted successfully' })

      await service.deleteEvent(5n, userId)

      expect(mockRepository.deleteEvent).toHaveBeenCalledWith(1n)
    })

    it('should throw NotFoundException when event not found', async () => {
      mockRepository.findEventById.mockResolvedValue(null)

      await expect(service.deleteEvent(999n, userId)).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException when user does not own event', async () => {
      mockRepository.findEventById.mockResolvedValue({ ...mockEvent, user_id: 'other-user' })

      await expect(service.deleteEvent(1n, userId)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('modifyThisAndFollow', () => {
    const recurrenceId = new Date('2024-02-01T10:00:00Z')
    const updateDto: UpdateEventDto = { title: 'Updated Series' } as UpdateEventDto
    const newEvent = { ...mockEvent, id: 2n, title: 'Updated Series' }

    it('should split series and create new event from recurrence_id', async () => {
      mockRepository.findEventById.mockResolvedValueOnce(mockEvent).mockResolvedValueOnce(mockEvent)
      mockRepository.splitRecurringSeries.mockResolvedValue(newEvent)

      const result = await service.modifyThisAndFollow(1n, recurrenceId, updateDto, userId)

      expect(mockRepository.splitRecurringSeries).toHaveBeenCalledWith(
        expect.objectContaining({
          parentEventId: 1n,
          userId,
          splitDate: recurrenceId,
          title: 'Updated Series'
        })
      )
      expect(result).toEqual(newEvent)
    })

    it('should use parent event when currentEvent is a child instance', async () => {
      const childEvent = { ...mockEvent, id: 5n, original_event_id: 1n }
      mockRepository.findEventById.mockResolvedValueOnce(childEvent).mockResolvedValueOnce(mockEvent)
      mockRepository.splitRecurringSeries.mockResolvedValue(newEvent)

      await service.modifyThisAndFollow(5n, recurrenceId, updateDto, userId)

      expect(mockRepository.splitRecurringSeries).toHaveBeenCalledWith(expect.objectContaining({ parentEventId: 1n }))
    })

    it('should throw NotFoundException when event not found', async () => {
      mockRepository.findEventById.mockResolvedValue(null)

      await expect(service.modifyThisAndFollow(999n, recurrenceId, updateDto, userId)).rejects.toThrow(
        'Event not found'
      )
    })

    it('should throw ForbiddenException when user does not own event', async () => {
      mockRepository.findEventById.mockResolvedValue({ ...mockEvent, user_id: 'other-user' })

      await expect(service.modifyThisAndFollow(1n, recurrenceId, updateDto, userId)).rejects.toThrow(ForbiddenException)
    })

    it('should throw BadRequestException for non-recurring parent event', async () => {
      mockRepository.findEventById
        .mockResolvedValueOnce(mockEvent)
        .mockResolvedValueOnce({ ...mockEvent, rrule_string: null })

      await expect(service.modifyThisAndFollow(1n, recurrenceId, updateDto, userId)).rejects.toThrow(
        'Cannot split non-recurring event'
      )
    })

    it('should throw BadRequestException when recurrence_id is after UNTIL date', async () => {
      const eventWithUntil = {
        ...mockEvent,
        rrule_string: 'RRULE:FREQ=WEEKLY;UNTIL=20240115T235959Z'
      }

      mockRepository.findEventById.mockResolvedValueOnce(eventWithUntil).mockResolvedValueOnce(eventWithUntil)

      await expect(service.modifyThisAndFollow(1n, recurrenceId, updateDto, userId)).rejects.toThrow(
        'Recurrence ID is after the existing UNTIL date of the series'
      )
    })
  })
})
