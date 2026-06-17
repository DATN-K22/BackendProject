// src/unit-tests/schedule/schedule.repository.spec.ts

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(),
  EventStatus: {
    CONFIRMED: 'CONFIRMED',
    TENTATIVE: 'TENTATIVE',
    CANCELLED: 'CANCELLED'
  }
}))

import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { ScheduleRepository } from '../../modules/schedule/schedule.repository'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateEventDto, CreateEventExceptionDto, UpdateEventDto } from '../../modules/schedule/dto'

// ─── Shared fixtures ──────────────────────────────────────────────────────────

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

// ─── Mock Prisma transaction ──────────────────────────────────────────────────

const mockTx = {
  event: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn()
  },
  eventExceptionDate: {
    create: jest.fn(),
    deleteMany: jest.fn()
  }
}

const mockPrisma = {
  event: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn()
  },
  eventExceptionDate: {
    create: jest.fn()
  },
  $transaction: jest.fn()
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('ScheduleRepository', () => {
  let repository: ScheduleRepository

  beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})

    const module: TestingModule = await Test.createTestingModule({
      providers: [ScheduleRepository, { provide: PrismaService, useValue: mockPrisma }]
    }).compile()

    repository = module.get<ScheduleRepository>(ScheduleRepository)
    jest.clearAllMocks()
  })

  // ─── findEventById ──────────────────────────────────────────────────────────

  describe('findEventById', () => {
    it('should return event when found', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(mockEvent)

      const result = await repository.findEventById(1n)

      expect(mockPrisma.event.findUnique).toHaveBeenCalledWith({ where: { id: 1n } })
      expect(result).toEqual(mockEvent)
    })

    it('should return null when event not found', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null)

      const result = await repository.findEventById(999n)

      expect(result).toBeNull()
    })
  })

  // ─── findEventByIdWithRelations ─────────────────────────────────────────────

  describe('findEventByIdWithRelations', () => {
    it('should return event with exception_dates and exceptions', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(mockEvent)

      const result = await repository.findEventByIdWithRelations(1n)

      expect(mockPrisma.event.findUnique).toHaveBeenCalledWith({
        where: { id: 1n },
        include: { exception_dates: true, exceptions: true }
      })
      expect(result).toEqual(mockEvent)
    })

    it('should return null when event not found', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null)

      const result = await repository.findEventByIdWithRelations(999n)

      expect(result).toBeNull()
    })
  })

  // ─── findEventsByName ───────────────────────────────────────────────────────

  describe('findEventsByName', () => {
    it('should return events matching title for user ordered by time_start', async () => {
      mockPrisma.event.findMany.mockResolvedValue([mockEvent])

      const result = await repository.findEventsByName('Meeting', userId)

      expect(mockPrisma.event.findMany).toHaveBeenCalledWith({
        where: {
          user_id: userId,
          title: { contains: 'Meeting', mode: 'insensitive' }
        },
        include: { exception_dates: true, exceptions: true },
        orderBy: { time_start: 'asc' }
      })
      expect(result).toEqual([mockEvent])
    })

    it('should return empty array when no events match', async () => {
      mockPrisma.event.findMany.mockResolvedValue([])

      const result = await repository.findEventsByName('Nonexistent', userId)

      expect(result).toEqual([])
    })
  })

  // ─── findMySchedule ─────────────────────────────────────────────────────────

  describe('findMySchedule', () => {
    it('should return all events for user ordered by time_start', async () => {
      mockPrisma.event.findMany.mockResolvedValue([mockEvent])

      const result = await repository.findMySchedule(userId)

      expect(mockPrisma.event.findMany).toHaveBeenCalledWith({
        where: { user_id: userId },
        include: { exception_dates: true, exceptions: true },
        orderBy: { time_start: 'asc' }
      })
      expect(result).toEqual([mockEvent])
    })

    it('should return empty array when user has no events', async () => {
      mockPrisma.event.findMany.mockResolvedValue([])

      const result = await repository.findMySchedule(userId)

      expect(result).toEqual([])
    })
  })

  // ─── createEvent ────────────────────────────────────────────────────────────

  describe('createEvent', () => {
    const dto: CreateEventDto = {
      title: 'New Meeting',
      time_start: '2024-01-01T10:00:00Z',
      time_end: '2024-01-01T11:00:00Z'
    } as CreateEventDto

    it('should create a simple event with default status and timezone', async () => {
      mockPrisma.event.create.mockResolvedValue(mockEvent)

      const result = await repository.createEvent(dto, userId)

      expect(mockPrisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: dto.title,
            status: 'CONFIRMED',
            timezone: 'UTC',
            time_start: new Date(dto.time_start),
            time_end: new Date(dto.time_end),
            rrule_string: undefined,
            recurrence_id: null,
            user: { connect: { id: userId } }
          })
        })
      )
      expect(result).toEqual(mockEvent)
    })

    it('should set rrule_string to null when original_event_id is provided', async () => {
      const exceptionDto: CreateEventDto = {
        ...dto,
        rrule_string: 'RRULE:FREQ=WEEKLY',
        original_event_id: 1n,
        recurrence_id: '2024-01-08T10:00:00Z'
      } as CreateEventDto
      mockPrisma.event.create.mockResolvedValue(mockEvent)

      await repository.createEvent(exceptionDto, userId)

      expect(mockPrisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rrule_string: null,
            recurrence_id: new Date('2024-01-08T10:00:00Z'),
            original_event: { connect: { id: 1n } }
          })
        })
      )
    })

    it('should keep rrule_string when no original_event_id', async () => {
      const recurringDto: CreateEventDto = {
        ...dto,
        rrule_string: 'RRULE:FREQ=DAILY'
      } as CreateEventDto
      mockPrisma.event.create.mockResolvedValue(mockEvent)

      await repository.createEvent(recurringDto, userId)

      expect(mockPrisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rrule_string: 'RRULE:FREQ=DAILY' })
        })
      )
    })

    it('should use provided status and timezone', async () => {
      const customDto: CreateEventDto = {
        ...dto,
        status: 'TENTATIVE' as any,
        timezone: 'Asia/Ho_Chi_Minh'
      } as CreateEventDto
      mockPrisma.event.create.mockResolvedValue(mockEvent)

      await repository.createEvent(customDto, userId)

      expect(mockPrisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'TENTATIVE',
            timezone: 'Asia/Ho_Chi_Minh'
          })
        })
      )
    })

    it('should propagate prisma error', async () => {
      mockPrisma.event.create.mockRejectedValue({ code: 'P2002' })

      await expect(repository.createEvent(dto, userId)).rejects.toMatchObject({ code: 'P2002' })
    })
  })

  // ─── updateEvent ────────────────────────────────────────────────────────────

  describe('updateEvent', () => {
    const updateData = { title: 'Updated Title', description: 'New desc' }

    it('should update event with incremented sequence and updated_at', async () => {
      const updatedEvent = { ...mockEvent, title: 'Updated Title', sequence: 1 }
      mockPrisma.event.update.mockResolvedValue(updatedEvent)

      const result = await repository.updateEvent(1n, updateData)

      expect(mockPrisma.event.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: {
          ...updateData,
          sequence: { increment: 1 },
          updated_at: expect.any(Date)
        },
        include: { exception_dates: true, exceptions: true }
      })
      expect(result).toEqual(updatedEvent)
    })

    it('should propagate prisma error when event not found (P2025)', async () => {
      mockPrisma.event.update.mockRejectedValue({ code: 'P2025' })

      await expect(repository.updateEvent(999n, updateData)).rejects.toMatchObject({ code: 'P2025' })
    })
  })

  // ─── addExceptionDate ───────────────────────────────────────────────────────

  describe('addExceptionDate', () => {
    const dto: CreateEventExceptionDto = {
      event_id: 1n,
      exception_date: '2024-01-15T00:00:00Z',
      reason: 'Holiday'
    } as unknown as CreateEventExceptionDto

    const mockExDate = {
      id: 10n,
      event_id: 1n,
      exception_date: new Date('2024-01-15T00:00:00Z'),
      reason: 'Holiday'
    }

    it('should add exception date without existing modified instance', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx))
      mockTx.event.findFirst.mockResolvedValue(null)
      mockTx.eventExceptionDate.create.mockResolvedValue(mockExDate)
      mockTx.event.update.mockResolvedValue({})

      const result = await repository.addExceptionDate(dto)

      expect(mockTx.event.findFirst).toHaveBeenCalledWith({
        where: {
          original_event_id: dto.event_id,
          recurrence_id: new Date(dto.exception_date)
        }
      })
      expect(mockTx.event.delete).not.toHaveBeenCalled()
      expect(mockTx.eventExceptionDate.create).toHaveBeenCalledWith({
        data: {
          exception_date: new Date(dto.exception_date),
          reason: dto.reason,
          event: { connect: { id: dto.event_id } }
        }
      })
      expect(mockTx.event.update).toHaveBeenCalledWith({
        where: { id: dto.event_id },
        data: { sequence: { increment: 1 }, updated_at: expect.any(Date) }
      })
      expect(result).toMatchObject({ id: 10n, event_id: 1n, reason: 'Holiday' })
    })

    it('should delete existing modified instance before adding exdate', async () => {
      const modifiedInstance = { ...mockEvent, id: 99n }
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx))
      mockTx.event.findFirst.mockResolvedValue(modifiedInstance)
      mockTx.event.delete.mockResolvedValue({})
      mockTx.eventExceptionDate.create.mockResolvedValue(mockExDate)
      mockTx.event.update.mockResolvedValue({})

      await repository.addExceptionDate(dto)

      expect(mockTx.event.delete).toHaveBeenCalledWith({ where: { id: 99n } })
      expect(mockTx.eventExceptionDate.create).toHaveBeenCalled()
    })

    it('should return reason as undefined when exDate.reason is null', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx))
      mockTx.event.findFirst.mockResolvedValue(null)
      mockTx.eventExceptionDate.create.mockResolvedValue({ ...mockExDate, reason: null })
      mockTx.event.update.mockResolvedValue({})

      const result = await repository.addExceptionDate({
        ...dto,
        reason: undefined
      } as unknown as CreateEventExceptionDto)

      expect(result.reason).toBeUndefined()
    })

    it('should propagate prisma error (P2002 duplicate)', async () => {
      mockPrisma.$transaction.mockRejectedValue({ code: 'P2002' })

      await expect(repository.addExceptionDate(dto)).rejects.toMatchObject({ code: 'P2002' })
    })
  })

  // ─── deleteEvent ────────────────────────────────────────────────────────────

  describe('deleteEvent', () => {
    it('should delete standalone event successfully', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx))
      mockTx.event.findUnique.mockResolvedValue(mockEvent) // no original_event_id
      mockTx.event.deleteMany.mockResolvedValue({})
      mockTx.event.delete.mockResolvedValue({})

      const result = await repository.deleteEvent(1n)

      expect(mockTx.event.deleteMany).toHaveBeenCalledWith({ where: { original_event_id: 1n } })
      expect(mockTx.event.delete).toHaveBeenCalledWith({ where: { id: 1n } })
      expect(result).toEqual({ message: 'Event deleted successfully' })
    })

    it('should delete parent series when event is a child instance', async () => {
      const childEvent = { ...mockEvent, id: 5n, original_event_id: 1n }
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx))
      mockTx.event.findUnique.mockResolvedValue(childEvent)
      mockTx.event.deleteMany.mockResolvedValue({})
      mockTx.event.delete.mockResolvedValue({})

      await repository.deleteEvent(5n)

      // eventToDelete phải là parent id (1n)
      expect(mockTx.event.deleteMany).toHaveBeenCalledWith({ where: { original_event_id: 1n } })
      expect(mockTx.event.delete).toHaveBeenCalledWith({ where: { id: 1n } })
    })

    it('should throw NotFoundException when event not found', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx))
      mockTx.event.findUnique.mockResolvedValue(null)

      await expect(repository.deleteEvent(999n)).rejects.toThrow(NotFoundException)
      await expect(repository.deleteEvent(999n)).rejects.toThrow('Event not found')
    })

    it('should propagate prisma error (P2025)', async () => {
      mockPrisma.$transaction.mockRejectedValue({ code: 'P2025' })

      await expect(repository.deleteEvent(1n)).rejects.toMatchObject({ code: 'P2025' })
    })
  })

  // ─── splitRecurringSeries ───────────────────────────────────────────────────

  describe('splitRecurringSeries', () => {
    const splitParams = {
      parentEventId: 1n,
      parentRruleWithUntil: 'RRULE:FREQ=WEEKLY;UNTIL=20240131T235959Z',
      splitDate: new Date('2024-02-01T10:00:00Z'),
      timeStart: new Date('2024-02-01T10:00:00Z'),
      timeEnd: new Date('2024-02-01T11:00:00Z'),
      title: 'Updated Series',
      description: 'New desc',
      location: 'Remote',
      status: 'CONFIRMED' as any,
      timezone: 'UTC',
      newRrule: 'RRULE:FREQ=WEEKLY',
      userId
    }

    const newEvent = { ...mockEvent, id: 2n, title: 'Updated Series' }

    it('should cap parent series, delete future overrides/exdates, and create new event', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx))
      mockTx.event.update.mockResolvedValue({})
      mockTx.event.deleteMany.mockResolvedValue({})
      mockTx.eventExceptionDate.deleteMany.mockResolvedValue({})
      mockTx.event.create.mockResolvedValue(newEvent)

      const result = await repository.splitRecurringSeries(splitParams)

      // 1. cap parent rrule
      expect(mockTx.event.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: {
          rrule_string: splitParams.parentRruleWithUntil,
          sequence: { increment: 1 },
          updated_at: expect.any(Date)
        }
      })

      // 2. delete future exception overrides
      expect(mockTx.event.deleteMany).toHaveBeenCalledWith({
        where: {
          original_event_id: 1n,
          recurrence_id: { gte: splitParams.splitDate }
        }
      })

      // 3. delete future exception dates
      expect(mockTx.eventExceptionDate.deleteMany).toHaveBeenCalledWith({
        where: {
          event_id: 1n,
          exception_date: { gte: splitParams.splitDate }
        }
      })

      // 4. create new series
      expect(mockTx.event.create).toHaveBeenCalledWith({
        data: {
          user: { connect: { id: userId } },
          title: splitParams.title,
          description: splitParams.description,
          location: splitParams.location,
          status: splitParams.status,
          time_start: splitParams.timeStart,
          time_end: splitParams.timeEnd,
          timezone: splitParams.timezone,
          rrule_string: splitParams.newRrule,
          sequence: 0
        },
        include: { exception_dates: true, exceptions: true }
      })

      expect(result).toEqual(newEvent)
    })

    it('should propagate prisma error', async () => {
      mockPrisma.$transaction.mockRejectedValue(new Error('Transaction failed'))

      await expect(repository.splitRecurringSeries(splitParams)).rejects.toThrow('Transaction failed')
    })
  })
})
