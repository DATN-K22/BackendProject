import { Test, TestingModule } from '@nestjs/testing';
import { EnrollJobWorker } from '../../modules/payment/payment.worker';
import { Logger } from '@nestjs/common/services/logger.service';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const makeJob = (overrides: Partial<any> = {}) => ({
  id: 'job-001',
  status: 'PENDING',
  attemptCount: 0,
  createdAt: new Date('2024-01-01'),
  payment: {
    userId: 'user-001',
    courseId: 'course-001'
  },
  ...overrides
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPrisma = {
  enrollJob: {
    findMany: jest.fn(),
    update: jest.fn()
  }
};

const mockCourseClient = {
  enrollUserInCourse: jest.fn()
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('EnrollJobWorker', () => {
  let worker: EnrollJobWorker;

  beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.useFakeTimers();

    // Manually instantiate to avoid onModuleInit spawning the real interval
    worker = new EnrollJobWorker(mockPrisma as any, mockCourseClient as any);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── onModuleInit ───────────────────────────────────────────────────────────

  describe('onModuleInit()', () => {
    it('should register a 30-second interval that calls run()', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const runSpy = jest.spyOn(worker, 'run').mockResolvedValue(undefined);

      worker.onModuleInit();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);

      // Advance time to trigger the interval callback
      jest.advanceTimersByTime(30_000);
      expect(runSpy).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(30_000);
      expect(runSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ─── run() — no jobs ───────────────────────────────────────────────────────

  describe('run() — empty queue', () => {
    it('should do nothing when there are no pending jobs', async () => {
      mockPrisma.enrollJob.findMany.mockResolvedValue([]);

      await worker.run();

      expect(mockPrisma.enrollJob.findMany).toHaveBeenCalledTimes(1);
      expect(mockCourseClient.enrollUserInCourse).not.toHaveBeenCalled();
      expect(mockPrisma.enrollJob.update).not.toHaveBeenCalled();
    });

    it('should query only PENDING jobs with attemptCount < 5, ordered by createdAt asc, limit 10', async () => {
      mockPrisma.enrollJob.findMany.mockResolvedValue([]);

      await worker.run();

      expect(mockPrisma.enrollJob.findMany).toHaveBeenCalledWith({
        where: { status: 'PENDING', attemptCount: { lt: 5 } },
        include: { payment: true },
        take: 10,
        orderBy: { createdAt: 'asc' }
      });
    });
  });

  // ─── run() — success path ──────────────────────────────────────────────────

  describe('run() — successful enrollment', () => {
    it('should enroll user and mark job as DONE', async () => {
      const job = makeJob();
      mockPrisma.enrollJob.findMany.mockResolvedValue([job]);
      mockCourseClient.enrollUserInCourse.mockResolvedValue(undefined);
      mockPrisma.enrollJob.update.mockResolvedValue({});

      await worker.run();

      expect(mockCourseClient.enrollUserInCourse).toHaveBeenCalledWith(job.payment.userId, job.payment.courseId);
      expect(mockPrisma.enrollJob.update).toHaveBeenCalledWith({
        where: { id: job.id },
        data: expect.objectContaining({ status: 'DONE' })
      });
    });

    it('should set lastAttemptAt on DONE update', async () => {
      const job = makeJob();
      mockPrisma.enrollJob.findMany.mockResolvedValue([job]);
      mockCourseClient.enrollUserInCourse.mockResolvedValue(undefined);
      mockPrisma.enrollJob.update.mockResolvedValue({});

      const before = Date.now();
      await worker.run();
      const after = Date.now();

      const updateData = mockPrisma.enrollJob.update.mock.calls[0][0].data;
      expect(updateData.lastAttemptAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(updateData.lastAttemptAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('should process multiple jobs in a single run', async () => {
      const jobs = [makeJob({ id: 'job-1' }), makeJob({ id: 'job-2' }), makeJob({ id: 'job-3' })];
      mockPrisma.enrollJob.findMany.mockResolvedValue(jobs);
      mockCourseClient.enrollUserInCourse.mockResolvedValue(undefined);
      mockPrisma.enrollJob.update.mockResolvedValue({});

      await worker.run();

      expect(mockCourseClient.enrollUserInCourse).toHaveBeenCalledTimes(3);
      expect(mockPrisma.enrollJob.update).toHaveBeenCalledTimes(3);
    });
  });

  // ─── run() — failure path ──────────────────────────────────────────────────

  describe('run() — enrollment failure', () => {
    it('should increment attemptCount and keep status PENDING when below MAX_ATTEMPTS', async () => {
      const job = makeJob({ attemptCount: 2 });
      mockPrisma.enrollJob.findMany.mockResolvedValue([job]);
      mockCourseClient.enrollUserInCourse.mockRejectedValue(new Error('gRPC timeout'));
      mockPrisma.enrollJob.update.mockResolvedValue({});

      await worker.run();

      expect(mockPrisma.enrollJob.update).toHaveBeenCalledWith({
        where: { id: job.id },
        data: expect.objectContaining({
          status: 'PENDING',
          attemptCount: 3,
          lastError: 'gRPC timeout'
        })
      });
    });

    it('should mark job as DEAD when attemptCount reaches MAX_ATTEMPTS (5)', async () => {
      const job = makeJob({ attemptCount: 4 }); // nextAttempt = 5 = MAX_ATTEMPTS
      mockPrisma.enrollJob.findMany.mockResolvedValue([job]);
      mockCourseClient.enrollUserInCourse.mockRejectedValue(new Error('service down'));
      mockPrisma.enrollJob.update.mockResolvedValue({});

      await worker.run();

      expect(mockPrisma.enrollJob.update).toHaveBeenCalledWith({
        where: { id: job.id },
        data: expect.objectContaining({ status: 'DEAD', attemptCount: 5 })
      });
    });

    it('should set lastAttemptAt on failure update', async () => {
      const job = makeJob();
      mockPrisma.enrollJob.findMany.mockResolvedValue([job]);
      mockCourseClient.enrollUserInCourse.mockRejectedValue(new Error('fail'));
      mockPrisma.enrollJob.update.mockResolvedValue({});

      const before = Date.now();
      await worker.run();
      const after = Date.now();

      const updateData = mockPrisma.enrollJob.update.mock.calls[0][0].data;
      expect(updateData.lastAttemptAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(updateData.lastAttemptAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('should record "Unknown error" as lastError when thrown value is not an Error instance', async () => {
      const job = makeJob();
      mockPrisma.enrollJob.findMany.mockResolvedValue([job]);
      mockCourseClient.enrollUserInCourse.mockRejectedValue('plain string error');
      mockPrisma.enrollJob.update.mockResolvedValue({});

      await worker.run();

      const updateData = mockPrisma.enrollJob.update.mock.calls[0][0].data;
      expect(updateData.lastError).toBe('Unknown error');
    });

    it('should continue processing remaining jobs when one job fails', async () => {
      const jobs = [
        makeJob({ id: 'job-fail' }),
        makeJob({ id: 'job-ok', payment: { userId: 'user-002', courseId: 'course-002' } })
      ];
      mockPrisma.enrollJob.findMany.mockResolvedValue(jobs);
      mockCourseClient.enrollUserInCourse
        .mockRejectedValueOnce(new Error('fail first'))
        .mockResolvedValueOnce(undefined);
      mockPrisma.enrollJob.update.mockResolvedValue({});

      await worker.run();

      expect(mockCourseClient.enrollUserInCourse).toHaveBeenCalledTimes(2);
      expect(mockPrisma.enrollJob.update).toHaveBeenCalledTimes(2);

      const firstUpdate = mockPrisma.enrollJob.update.mock.calls[0][0];
      const secondUpdate = mockPrisma.enrollJob.update.mock.calls[1][0];
      expect(firstUpdate.data.status).toBe('PENDING');
      expect(secondUpdate.data.status).toBe('DONE');
    });
  });

  // ─── attemptCount boundary ─────────────────────────────────────────────────

  describe('run() — attemptCount boundary', () => {
    it.each([
      [0, 'PENDING'],
      [1, 'PENDING'],
      [2, 'PENDING'],
      [3, 'PENDING'],
      [4, 'DEAD']
    ])(
      'should set status=%s when current attemptCount=%i and enrollment fails',
      async (currentAttempt, expectedStatus) => {
        const job = makeJob({ attemptCount: currentAttempt });
        mockPrisma.enrollJob.findMany.mockResolvedValue([job]);
        mockCourseClient.enrollUserInCourse.mockRejectedValue(new Error('err'));
        mockPrisma.enrollJob.update.mockResolvedValue({});

        await worker.run();

        const updateData = mockPrisma.enrollJob.update.mock.calls[0][0].data;
        expect(updateData.status).toBe(expectedStatus);
        expect(updateData.attemptCount).toBe(currentAttempt + 1);
      }
    );
  });
});
