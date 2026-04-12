import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { CreateFileDto } from './dto/request/create-file.dto';

@Injectable()
export class FileRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createFileDto: CreateFileDto, path: string, filename: string) {
    const record = await this.prismaService.resource.create({
      data: {
        title: createFileDto.title,
        type: createFileDto.type,
        path: path,
        filename: filename,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        lesson_id: BigInt(createFileDto.lesson_id)
      }
    });
    return {
      ...record,
      id: record.id.toString(),
      lesson_id: record.lesson_id?.toString()
    };
  }

  async findById(id: number) {
    return this.prismaService.resource.findFirst({ where: { id } });
  }

  async deleteById(id: number) {
    return this.prismaService.resource.delete({ where: { id } });
  }

  async findResourcesByLessonId(lessonId: string) {
    return this.prismaService.resource.findMany({ where: { lesson_id: BigInt(lessonId) } });
  }
}
