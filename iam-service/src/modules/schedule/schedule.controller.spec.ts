import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';

describe('ScheduleController', () => {
  let controller: ScheduleController;
  const scheduleService = {
    getMySchedule: jest.fn(),
    getEventsByName: jest.fn(),
    getEventById: jest.fn(),
    createEvent: jest.fn(),
    updateEvent: jest.fn(),
    deleteEvent: jest.fn(),
    addExDate: jest.fn(),
    modifyThisAndFollow: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScheduleController],
      providers: [
        {
          provide: ScheduleService,
          useValue: scheduleService,
        },
      ],
    }).compile();

    controller = module.get<ScheduleController>(ScheduleController);
  });

  it('getEventById converts id to BigInt and forwards user id', async () => {
    scheduleService.getEventById.mockResolvedValue({ id: 1n });

    await controller.getEventById('42', 'user-1');

    expect(scheduleService.getEventById).toHaveBeenCalledWith(42n, 'user-1');
  });

  it('addExceptionDate overrides dto.event_id from route param', async () => {
    const dto: any = { event_id: 999n, exception_date: '2026-05-10T00:00:00.000Z' };
    scheduleService.addExDate.mockResolvedValue({ id: 12n });

    await controller.addExceptionDate('7', dto, 'user-1');

    expect(scheduleService.addExDate).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: 7n }),
      'user-1',
    );
  });

  it('modifyThisAndFollow parses recurrence_id date and event id correctly', async () => {
    scheduleService.modifyThisAndFollow.mockResolvedValue({ id: 77n });

    await controller.modifyThisAndFollow(
      '13',
      {
        recurrence_id: '2026-05-20T00:00:00.000Z',
        updates: { title: 'Rescheduled' },
      },
      'user-1',
    );

    expect(scheduleService.modifyThisAndFollow).toHaveBeenCalledWith(
      13n,
      new Date('2026-05-20T00:00:00.000Z'),
      { title: 'Rescheduled' },
      'user-1',
    );
  });
});
