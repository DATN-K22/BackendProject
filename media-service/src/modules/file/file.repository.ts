import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { CreateFileDto } from './dto/request/create-file.dto';

@Injectable()
export class FileRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createFileDto: CreateFileDto, path: string, filename: string) {
    const chapterItemId = createFileDto.chapter_item_id ?? createFileDto.lesson_id;

    const record = await this.prismaService.resource.create({
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
    return this.prismaService.resource.findFirst({ where: { id } });
  }

  async deleteById(id: number) {
    return this.prismaService.resource.delete({ where: { id } });
  }

  async findResourcesByChapterItemId(chapterItemId: string) {
    return this.prismaService.resource.findMany({ where: { lesson_id: BigInt(chapterItemId) } });
  }

  async findResourcesByLessonId(lessonId: string) {
    return this.findResourcesByChapterItemId(lessonId);
  }
}
