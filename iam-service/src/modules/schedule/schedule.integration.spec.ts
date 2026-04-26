import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('Schedule module integration (controller + service)', () => {
  let controller: ScheduleController;

  const prismaMock = {
    event: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
    eventExceptionDate: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScheduleController],
      providers: [
        ScheduleService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    controller = module.get<ScheduleController>(ScheduleController);
  });

  it('returns wrapped schedule response for current user', async () => {
    prismaMock.event.findMany.mockResolvedValue([
      {
        id: 1,
        user_id: 'user-1',
        title: 'Daily standup',
        exception_dates: [],
        exceptions: [],
      },
    ]);

    const response = await controller.getMySchedule('user-1');

    expect(response.success).toBe(true);
    expect(response.message).toBe('Schedule retrieved successfully');
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 'user-1' } }),
    );
  });

  it('creates event through controller + service + prisma path', async () => {
    prismaMock.event.create.mockResolvedValue({
      id: 2,
      user_id: 'user-1',
      title: 'Create test event',
      exception_dates: [],
      exceptions: [],
    });

    const payload = {
      title: 'Create test event',
      time_start: '2026-05-10T01:00:00.000Z',
      time_end: '2026-05-10T02:00:00.000Z',
      timezone: 'UTC',
    };

    const response = await controller.createEvent(payload as any, 'user-1');

    expect(response.success).toBe(true);
    expect(response.message).toBe('Event created successfully');
    expect(prismaMock.event.create).toHaveBeenCalled();
  });

  it('throws BadRequestException on invalid event time range', async () => {
    const payload = {
      title: 'Invalid range event',
      time_start: '2026-05-10T05:00:00.000Z',
      time_end: '2026-05-10T02:00:00.000Z',
    };

    await expect(controller.createEvent(payload as any, 'user-1')).rejects.toThrow(
      new BadRequestException('Start time must be before the end time'),
    );
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException for getEventById when non-owner accesses event', async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 99n,
      user_id: 'another-user',
      exception_dates: [],
      exceptions: [],
    });

    await expect(controller.getEventById('99', 'user-1')).rejects.toThrow(ForbiddenException);
  });
});
