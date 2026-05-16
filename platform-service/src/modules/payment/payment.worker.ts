// enroll-job.worker.ts
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseClient } from '../course-service/CourseClient';

@Injectable()
export class EnrollJobWorker implements OnModuleInit {
  private readonly logger = new Logger(EnrollJobWorker.name);
  private readonly MAX_ATTEMPTS = 5;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('CourseClient')
    private readonly courseClient: CourseClient
  ) {}

  onModuleInit() {
    setInterval(() => this.run(), 30_000);
  }

  async run() {
    const jobs = await this.prisma.enrollJob.findMany({
      where: { status: 'PENDING', attemptCount: { lt: this.MAX_ATTEMPTS } },
      include: { payment: true },
      take: 10,
      orderBy: { createdAt: 'asc' }
    });

    for (const job of jobs) {
      try {
        await this.courseClient.enrollUserInCourse(job.payment.userId, job.payment.courseId);

        await this.prisma.enrollJob.update({
          where: { id: job.id },
          data: { status: 'DONE', lastAttemptAt: new Date() }
        });

        this.logger.log(`Enroll success - jobId: ${job.id}`);
      } catch (err) {
        const nextAttempt = job.attemptCount + 1;
        const isDead = nextAttempt >= this.MAX_ATTEMPTS;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';

        await this.prisma.enrollJob.update({
          where: { id: job.id },
          data: {
            attemptCount: nextAttempt,
            status: isDead ? 'DEAD' : 'PENDING',
            lastAttemptAt: new Date(),
            lastError: errorMessage
          }
        });

        this.logger.error(`Enroll failed (attempt ${nextAttempt}/${this.MAX_ATTEMPTS}) - jobId: ${job.id}`, err);
      }
    }
  }
}
