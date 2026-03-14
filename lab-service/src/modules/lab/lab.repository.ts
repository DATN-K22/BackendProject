import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LabRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async getLabDetail(lessonId: string) {
    const labDetail = await this.prismaService.lab.findUnique({
      where: { lesson_id: BigInt(lessonId) },
    });
    return labDetail;
  }
}
