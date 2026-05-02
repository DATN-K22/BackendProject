import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFileDto } from './dto/request/create-file.dto';

@Injectable()
export class FileRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createFileDto: CreateFileDto, path: string, filename: string) {
    const chapterItemId = createFileDto.chapter_item_id ?? createFileDto.lesson_id;
    const prisma: any = this.prismaService as any;

    const record = await prisma.resource.create({
      data: {
        title: createFileDto.title,
        type: createFileDto.type,
        path: path,
        filename: filename,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        lesson_id: chapterItemId ? BigInt(chapterItemId) : null
      }
    });
    return {
      ...record,
      id: record.id.toString(),
      chapter_item_id: record.lesson_id?.toString(),
      lesson_id: record.lesson_id?.toString()
    };
  }

  async findById(id: number) {
    const prisma: any = this.prismaService as any;
    return prisma.resource.findFirst({ where: { id } });
  }

  async deleteById(id: number) {
    const prisma: any = this.prismaService as any;
    return prisma.resource.delete({ where: { id } });
  }

  async findResourcesByChapterItemId(chapterItemId: string) {
    const prisma: any = this.prismaService as any;
    return prisma.resource.findMany({ where: { lesson_id: BigInt(chapterItemId) } });
  }

  async findResourcesByLessonId(lessonId: string) {
    return this.findResourcesByChapterItemId(lessonId);
  }
}
