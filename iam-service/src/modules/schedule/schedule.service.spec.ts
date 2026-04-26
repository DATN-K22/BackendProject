import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleService } from './schedule.service';
import { PrismaService } from '../../prisma/prisma.service';

type MockPrisma = {
  event: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
    delete: jest.Mock;
    findFirst: jest.Mock;
  };
  eventExceptionDate: {
    create: jest.Mock;
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('ScheduleService', () => {
  let service: ScheduleService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = {
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<ScheduleService>(ScheduleService);
  });

  it('creates a single event with default status and timezone', async () => {
    const dto = {
      title: 'Exam prep',
      time_start: '2026-05-01T01:00:00.000Z',
      time_end: '2026-05-01T02:00:00.000Z',
    };

    prisma.event.create.mockResolvedValue({ id: 101n, user_id: 'user-1', ...dto });

    const result = await service.createEvent(dto as any, 'user-1');

    expect(prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CONFIRMED',
          timezone: 'UTC',
          rrule_string: undefined,
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: 101n }));
  });

  it('rejects createEvent when time_start is after time_end', async () => {
    const dto = {
      title: 'Invalid event',
      time_start: '2026-05-01T05:00:00.000Z',
      time_end: '2026-05-01T01:00:00.000Z',
    };

    await expect(service.createEvent(dto as any, 'user-1')).rejects.toThrow(
      new BadRequestException('Start time must be before the end time'),
    );
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  it('rejects createEvent when RRULE does not start with RRULE:', async () => {
    const dto = {
      title: 'Recurring event',
      time_start: '2026-05-01T01:00:00.000Z',
      time_end: '2026-05-01T02:00:00.000Z',
      rrule_string: 'FREQ=WEEKLY;BYDAY=MO',
    };

    await expect(service.createEvent(dto as any, 'user-1')).rejects.toThrow(
      new BadRequestException('Invalid RRULE format: must start with "RRULE:"'),
    );
  });

  it('rejects creating exception when original event belongs to another user', async () => {
    const dto = {
      title: 'Exception instance',
      time_start: '2026-05-01T01:00:00.000Z',
      time_end: '2026-05-01T02:00:00.000Z',
      original_event_id: 999n,
    };

    prisma.event.findUnique.mockResolvedValue({
      id: 999n,
      user_id: 'another-user',
      rrule_string: 'RRULE:FREQ=DAILY',
    });

    await expect(service.createEvent(dto as any, 'user-1')).rejects.toThrow(ForbiddenException);
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  it('updates only allowed fields and increments sequence', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 7n,
      user_id: 'user-1',
      time_start: new Date('2026-05-01T01:00:00.000Z'),
      time_end: new Date('2026-05-01T02:00:00.000Z'),
    });

    prisma.event.update.mockResolvedValue({ id: 7n, user_id: 'user-1' });

    const dto: any = {
      title: 'Updated title',
      time_start: '2026-05-01T03:00:00.000Z',
      time_end: '2026-05-01T04:00:00.000Z',
      user_id: 'hacker',
    };

    await service.updateEvent(dto, 'user-1', 7n);

    const updateArg = prisma.event.update.mock.calls[0][0];
    expect(updateArg.data.title).toBe('Updated title');
    expect(updateArg.data.time_start).toEqual(new Date('2026-05-01T03:00:00.000Z'));
    expect(updateArg.data.sequence).toEqual({ increment: 1 });
    expect(updateArg.data.user_id).toBeUndefined();
  });

  it('addExDate removes modified instance before creating exception date', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 7n,
      user_id: 'user-1',
      rrule_string: 'RRULE:FREQ=DAILY',
    });

    const tx = {
      event: {
        findFirst: jest.fn().mockResolvedValue({ id: 44n }),
        delete: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      eventExceptionDate: {
        create: jest.fn().mockResolvedValue({ id: 88n }),
      },
    };

    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await service.addExDate(
      {
        event_id: 7n,
        exception_date: '2026-05-10T00:00:00.000Z',
        reason: 'holiday',
      },
      'user-1',
    );

    expect(tx.event.delete).toHaveBeenCalledWith({ where: { id: 44n } });
    expect(tx.eventExceptionDate.create).toHaveBeenCalled();
  });

  it('deleteEvent on child event deletes the whole series via parent id', async () => {
    const tx = {
      event: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 11n, user_id: 'user-1', original_event_id: 3n })
          .mockResolvedValueOnce({ id: 3n, user_id: 'user-1', original_event_id: null }),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        delete: jest.fn().mockResolvedValue({ id: 3n }),
      },
    };

    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const result = await service.deleteEvent(11n, 'user-1');

    expect(tx.event.deleteMany).toHaveBeenCalledWith({ where: { original_event_id: 3n } });
    expect(tx.event.delete).toHaveBeenCalledWith({ where: { id: 3n } });
    expect(result).toEqual({ message: 'Event deleted successfully' });
  });

  it('modifyThisAndFollow rejects splitting non-recurring series', async () => {
    const tx = {
      event: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 21n, user_id: 'user-1', original_event_id: null })
          .mockResolvedValueOnce({
            id: 21n,
            user_id: 'user-1',
            original_event_id: null,
            rrule_string: null,
          }),
      },
      eventExceptionDate: {
        deleteMany: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await expect(
      service.modifyThisAndFollow(
        21n,
        new Date('2026-06-01T00:00:00.000Z'),
        { title: 'New title' },
        'user-1',
      ),
    ).rejects.toThrow(new BadRequestException('Cannot split non-recurring event'));
  });
});
