import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFileDto } from './dto/request/create-file.dto';

interface CreateVideoResourceInput {
  title: string;
  courseId: string;
  lessonId: string;
  key: string;
  uploadId: string;
  totalParts: number;
}

@Injectable()
export class FileRepository {
  constructor(private readonly prismaService: PrismaService) {}

  // ── Resource ───────────────────────────────────────────────────────────────

  async create(createFileDto: CreateFileDto, path: string, filename: string) {
    const chapterItemId = createFileDto.chapter_item_id ?? createFileDto.lesson_id;
    const prisma: any = this.prismaService as any;

    const record = await prisma.resource.create({
      data: {
        title: createFileDto.title,
        type: createFileDto.type,
        path,
        filename,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        lesson_id: chapterItemId ? BigInt(chapterItemId) : null
      }
    });

    return this.serializeResource(record);
  }

  async createVideoResource(input: CreateVideoResourceInput) {
    const prisma: any = this.prismaService as any;
    const keyParts = input.key.split('/');
    const resourceFilenameOriginal = keyParts[keyParts.length - 1];
    const resourceFilename = resourceFilenameOriginal.split('.').slice(0, -1).join('.') + '_hls.m3u8';
    const resourcePath = keyParts.slice(0, -1).join('/');

    const resource = await prisma.resource.create({
      data: {
        title: input.title,
        type: 'video',
        path: resourcePath,
        filename: resourceFilename,
        lesson_id: BigInt(input.lessonId),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });

    await prisma.uploadSession.create({
      data: {
        upload_id: input.uploadId,
        key: input.key,
        status: 'INITIATED',
        total_parts: input.totalParts,
        uploaded_parts: [],
        resource_id: resource.id,
        lesson_id: BigInt(input.lessonId),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h TTL
      }
    });

    return this.serializeResource(resource);
  }

  async findById(id: number) {
    const prisma: any = this.prismaService as any;
    return prisma.resource.findFirst({ where: { id } });
  }

  async findVideoByLessonId(lessonId: string) {
    const prisma: any = this.prismaService as any;
    return prisma.resource.findFirst({
      where: { lesson_id: BigInt(lessonId), type: 'video' }
    });
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

  async finalizeVideoUpload(uploadId: string, resourceId: string) {
    const prisma: any = this.prismaService as any;

    await prisma.$transaction([
      prisma.uploadSession.update({
        where: { upload_id: uploadId },
        data: { status: 'COMPLETED' }
      }),
      prisma.resource.update({
        where: { id: BigInt(resourceId) },
        data: { updated_at: new Date().toISOString() }
      })
    ]);
  }

  // ── Upload Session ─────────────────────────────────────────────────────────

  async findActiveUploadSession(lessonId: string) {
    const prisma: any = this.prismaService as any;
    const session = await prisma.uploadSession.findFirst({
      where: {
        lesson_id: BigInt(lessonId),
        status: { in: ['INITIATED', 'IN_PROGRESS'] },
        expires_at: { gt: new Date() }
      }
    });

    if (!session) return null;

    return {
      uploadId: session.upload_id as string,
      key: session.key as string,
      totalParts: session.total_parts as number,
      status: session.status as string,
      resourceId: session.resource_id.toString() as string
    };
  }

  async findUploadSessionByUploadId(uploadId: string) {
    const prisma: any = this.prismaService as any;
    const session = await prisma.uploadSession.findUnique({
      where: { upload_id: uploadId }
    });

    if (!session) return null;

    return {
      uploadId: session.upload_id as string,
      key: session.key as string,
      totalParts: session.total_parts as number,
      status: session.status as string,
      resourceId: session.resource_id.toString() as string
    };
  }

  async updateUploadSessionStatus(uploadId: string, status: string) {
    const prisma: any = this.prismaService as any;
    return prisma.uploadSession.update({
      where: { upload_id: uploadId },
      data: { status, updated_at: new Date().toISOString() }
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private serializeResource(record: any) {
    return {
      ...record,
      id: record.id.toString(),
      chapter_item_id: record.lesson_id?.toString(),
      lesson_id: record.lesson_id?.toString()
    };
  }
}
