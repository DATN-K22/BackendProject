// src/unit-tests/schedule/schedule.controller.spec.ts

jest.mock('../../utils/dto/ApiResponse.dto', () => ({
  ApiResponse: {
    OkResponse: jest.fn((data, message?) => ({ success: true, data, message })),
    OkCreateResponse: jest.fn((data, message?) => ({ success: true, data, message }))
  }
}))

import { Test, TestingModule } from '@nestjs/testing'
import { ScheduleController } from '../../modules/schedule/schedule.controller'
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard'
import { ApiResponse } from '../../utils/dto/ApiResponse.dto'
import { CreateEventDto, CreateEventExceptionDto, UpdateEventDto } from '../../modules/schedule/dto'
import { ScheduleService } from '../../modules/schedule/schedule.service'

// ─── Mock Service ─────────────────────────────────────────────────────────────

const mockScheduleService = {
  getMySchedule: jest.fn(),
  getEventsByName: jest.fn(),
  getEventById: jest.fn(),
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
  deleteEvent: jest.fn(),
  addExDate: jest.fn(),
  modifyThisAndFollow: jest.fn()
}

// ─── Mock Guard ───────────────────────────────────────────────────────────────

const mockJwtAuthGuard = { canActivate: jest.fn().mockReturnValue(true) }

describe('ScheduleController', () => {
  let controller: ScheduleController

  const userId = 'user-123'

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScheduleController],
      providers: [{ provide: ScheduleService, useValue: mockScheduleService }]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile()

    controller = module.get<ScheduleController>(ScheduleController)
    jest.clearAllMocks()
  })

  // ─── getMySchedule ──────────────────────────────────────────────────────────

  describe('getMySchedule', () => {
    it('should return schedule for current user', async () => {
      const mockData = [{ id: 1n, title: 'Meeting' }]
      mockScheduleService.getMySchedule.mockResolvedValue(mockData)

      const result = await controller.getMySchedule(userId)

      expect(mockScheduleService.getMySchedule).toHaveBeenCalledWith(userId)
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith(mockData, 'Schedule retrieved successfully')
      expect(result).toEqual({ success: true, data: mockData, message: 'Schedule retrieved successfully' })
    })

    it('should propagate error from service', async () => {
      mockScheduleService.getMySchedule.mockRejectedValue(new Error('DB error'))

      await expect(controller.getMySchedule(userId)).rejects.toThrow('DB error')
    })
  })

  // ─── getEventsByName ────────────────────────────────────────────────────────

  describe('getEventsByName', () => {
    it('should return events matching the title', async () => {
      const mockData = [{ id: 1n, title: 'Team Standup' }]
      mockScheduleService.getEventsByName.mockResolvedValue(mockData)

      const result = await controller.getEventsByName('Team Standup', userId)

      expect(mockScheduleService.getEventsByName).toHaveBeenCalledWith('Team Standup', userId)
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith(mockData, 'Events retrieved successfully')
      expect(result).toEqual({ success: true, data: mockData, message: 'Events retrieved successfully' })
    })

    it('should return empty array when no events match', async () => {
      mockScheduleService.getEventsByName.mockResolvedValue([])

      const result = await controller.getEventsByName('Nonexistent', userId)

      expect(result).toEqual({ success: true, data: [], message: 'Events retrieved successfully' })
    })

    it('should propagate error from service', async () => {
      mockScheduleService.getEventsByName.mockRejectedValue(new Error('Search failed'))

      await expect(controller.getEventsByName('title', userId)).rejects.toThrow('Search failed')
    })
  })

  // ─── getEventById ───────────────────────────────────────────────────────────

  describe('getEventById', () => {
    it('should return event by id', async () => {
      const mockData = { id: 1n, title: 'Meeting' }
      mockScheduleService.getEventById.mockResolvedValue(mockData)

      const result = await controller.getEventById('1', userId)

      expect(mockScheduleService.getEventById).toHaveBeenCalledWith(1n, userId)
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith(mockData, 'Event retrieved successfully')
      expect(result).toEqual({ success: true, data: mockData, message: 'Event retrieved successfully' })
    })

    it('should convert eventId string to BigInt correctly', async () => {
      mockScheduleService.getEventById.mockResolvedValue({})

      await controller.getEventById('999', userId)

      expect(mockScheduleService.getEventById).toHaveBeenCalledWith(999n, userId)
    })

    it('should propagate error from service', async () => {
      mockScheduleService.getEventById.mockRejectedValue(new Error('Event not found'))

      await expect(controller.getEventById('1', userId)).rejects.toThrow('Event not found')
    })
  })

  // ─── createEvent ────────────────────────────────────────────────────────────

  describe('createEvent', () => {
    const dto: CreateEventDto = {
      title: 'New Meeting',
      time_start: '2024-01-01T10:00:00Z',
      time_end: '2024-01-01T11:00:00Z'
    } as CreateEventDto

    it('should create event and return created response', async () => {
      const mockData = { id: 1n, ...dto }
      mockScheduleService.createEvent.mockResolvedValue(mockData)

      const result = await controller.createEvent(dto, userId)

      expect(mockScheduleService.createEvent).toHaveBeenCalledWith(dto, userId)
      expect(ApiResponse.OkCreateResponse).toHaveBeenCalledWith(mockData, 'Event created successfully')
      expect(result).toEqual({ success: true, data: mockData, message: 'Event created successfully' })
    })

    it('should propagate error from service', async () => {
      mockScheduleService.createEvent.mockRejectedValue(new Error('Validation failed'))

      await expect(controller.createEvent(dto, userId)).rejects.toThrow('Validation failed')
    })
  })

  // ─── updateEvent ────────────────────────────────────────────────────────────

  describe('updateEvent', () => {
    const dto: UpdateEventDto = { title: 'Updated Meeting' } as UpdateEventDto

    it('should update event successfully', async () => {
      const mockData = { id: 1n, title: 'Updated Meeting' }
      mockScheduleService.updateEvent.mockResolvedValue(mockData)

      const result = await controller.updateEvent(dto, '1', userId)

      expect(mockScheduleService.updateEvent).toHaveBeenCalledWith(dto, userId, 1n)
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith(mockData, 'Event updated successfully')
      expect(result).toEqual({ success: true, data: mockData, message: 'Event updated successfully' })
    })

    it('should convert eventId string to BigInt correctly', async () => {
      mockScheduleService.updateEvent.mockResolvedValue({})

      await controller.updateEvent(dto, '42', userId)

      expect(mockScheduleService.updateEvent).toHaveBeenCalledWith(dto, userId, 42n)
    })

    it('should propagate error from service', async () => {
      mockScheduleService.updateEvent.mockRejectedValue(new Error('Event not found'))

      await expect(controller.updateEvent(dto, '1', userId)).rejects.toThrow('Event not found')
    })
  })

  // ─── deleteEvent ────────────────────────────────────────────────────────────

  describe('deleteEvent', () => {
    it('should delete event successfully', async () => {
      const mockData = { deleted: true }
      mockScheduleService.deleteEvent.mockResolvedValue(mockData)

      const result = await controller.deleteEvent('1', userId)

      expect(mockScheduleService.deleteEvent).toHaveBeenCalledWith(1n, userId)
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith(mockData, 'Event deleted successfully')
      expect(result).toEqual({ success: true, data: mockData, message: 'Event deleted successfully' })
    })

    it('should convert eventId string to BigInt correctly', async () => {
      mockScheduleService.deleteEvent.mockResolvedValue({})

      await controller.deleteEvent('99', userId)

      expect(mockScheduleService.deleteEvent).toHaveBeenCalledWith(99n, userId)
    })

    it('should propagate error from service', async () => {
      mockScheduleService.deleteEvent.mockRejectedValue(new Error('Event not found'))

      await expect(controller.deleteEvent('1', userId)).rejects.toThrow('Event not found')
    })
  })

  // ─── addExceptionDate ───────────────────────────────────────────────────────

  describe('addExceptionDate', () => {
    it('should add exception date and return created response', async () => {
      const dto: CreateEventExceptionDto = {
        event_id: 0n,
        exception_date: '2024-01-15T00:00:00Z'
      } as unknown as CreateEventExceptionDto
      const mockData = { id: 1n, event_id: 5n, exception_date: dto.exception_date }
      mockScheduleService.addExDate.mockResolvedValue(mockData)

      const result = await controller.addExceptionDate('5', dto, userId)

      // dto.event_id phải được gán từ param
      expect(dto.event_id).toBe(5n)
      expect(mockScheduleService.addExDate).toHaveBeenCalledWith(dto, userId)
      expect(ApiResponse.OkCreateResponse).toHaveBeenCalledWith(mockData, 'Exception date added successfully')
      expect(result).toEqual({
        success: true,
        data: mockData,
        message: 'Exception date added successfully'
      })
    })

    it('should override dto.event_id with param id', async () => {
      const dto: CreateEventExceptionDto = {
        event_id: 999n,
        exception_date: '2024-01-15T00:00:00Z'
      } as unknown as CreateEventExceptionDto
      mockScheduleService.addExDate.mockResolvedValue({})

      await controller.addExceptionDate('7', dto, userId)

      // event_id phải bị override thành 7n
      expect(dto.event_id).toBe(7n)
      expect(mockScheduleService.addExDate).toHaveBeenCalledWith(expect.objectContaining({ event_id: 7n }), userId)
    })

    it('should propagate error from service', async () => {
      const dto: CreateEventExceptionDto = {
        event_id: 0n,
        exception_date: '2024-01-15T00:00:00Z'
      } as unknown as CreateEventExceptionDto
      mockScheduleService.addExDate.mockRejectedValue(new Error('Event not found'))

      await expect(controller.addExceptionDate('1', dto, userId)).rejects.toThrow('Event not found')
    })
  })

  // ─── modifyThisAndFollow ────────────────────────────────────────────────────

  describe('modifyThisAndFollow', () => {
    const recurrenceId = '2024-01-15T10:00:00.000Z'
    const updates: UpdateEventDto = { title: 'Modified Event' } as UpdateEventDto
    const body = { recurrence_id: recurrenceId, updates }

    it('should modify this and following events successfully', async () => {
      const mockData = { modified: 3 }
      mockScheduleService.modifyThisAndFollow.mockResolvedValue(mockData)

      const result = await controller.modifyThisAndFollow('1', body, userId)

      expect(mockScheduleService.modifyThisAndFollow).toHaveBeenCalledWith(1n, new Date(recurrenceId), updates, userId)
      expect(ApiResponse.OkResponse).toHaveBeenCalledWith(mockData, 'Recurring event updated successfully')
      expect(result).toEqual({
        success: true,
        data: mockData,
        message: 'Recurring event updated successfully'
      })
    })

    it('should convert eventId string to BigInt correctly', async () => {
      mockScheduleService.modifyThisAndFollow.mockResolvedValue({})

      await controller.modifyThisAndFollow('55', body, userId)

      expect(mockScheduleService.modifyThisAndFollow).toHaveBeenCalledWith(55n, expect.any(Date), updates, userId)
    })

    it('should parse recurrence_id string to Date correctly', async () => {
      mockScheduleService.modifyThisAndFollow.mockResolvedValue({})

      await controller.modifyThisAndFollow('1', body, userId)

      const calledDate = mockScheduleService.modifyThisAndFollow.mock.calls[0][1]
      expect(calledDate).toBeInstanceOf(Date)
      expect(calledDate.toISOString()).toBe(new Date(recurrenceId).toISOString())
    })

    it('should propagate error from service', async () => {
      mockScheduleService.modifyThisAndFollow.mockRejectedValue(new Error('Recurrence not found'))

      await expect(controller.modifyThisAndFollow('1', body, userId)).rejects.toThrow('Recurrence not found')
    })
  })
})
