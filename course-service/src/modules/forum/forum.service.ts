import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { CreateForumDto } from './dto/create-forum.dto'
import { UpdateForumDto } from './dto/update-forum.dto'
import { PrismaService } from '../prisma/prisma.service'
@Injectable()
export class ForumService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateForumDto) {
    // Kiểm tra course có tồn tại không
    const course = await this.prisma.course.findUnique({
      where: { id: BigInt(dto.course_id) }
    })

    if (!course) {
      throw new NotFoundException('Khóa học không tồn tại')
    }

    // Kiểm tra course đã có forum chưa
    const existingForum = await this.prisma.forum.findUnique({
      where: { course_id: BigInt(dto.course_id) }
    })

    if (existingForum) {
      throw new BadRequestException('Khóa học này đã có forum')
    }

    return this.prisma.forum.create({
      data: {
        course_id: BigInt(dto.course_id),
        short_description: dto.short_description,
        long_description: dto.long_description,
        thumbnail_url: dto.thumbnail_url
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            owner_id: true
          }
        }
      }
    })
  }

  findAll(params: { skip?: number; take?: number; courseId?: bigint }) {
    const { skip, take, courseId } = params
    return this.prisma.forum.findMany({
      skip,
      take,
      where: courseId ? { course_id: courseId } : undefined,
      orderBy: { id: 'desc' },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            owner_id: true
          }
        },
        _count: {
          select: {
            messages: true
          }
        }
      }
    })
  }

  async findByCourseId(courseId: string) {
    const forum = await this.prisma.forum.findUnique({
      where: { course_id: BigInt(courseId) },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            owner_id: true
          }
        },
        messages: {
          where: { parent_message_id: null },
          orderBy: { created_at: 'desc' },
          take: 20,
          include: {
            _count: {
              select: {
                replies: true
              }
            }
          }
        }
      }
    })

    if (!forum) {
      throw new NotFoundException('Forum không tồn tại')
    }

    return forum
  }

  async findOne(id: string) {
    const forum = await this.prisma.forum.findUnique({
      where: { id: BigInt(id) },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            owner_id: true
          }
        },
        messages: {
          where: { parent_message_id: null },
          orderBy: { created_at: 'desc' },
          take: 20,
          include: {
            _count: {
              select: {
                replies: true
              }
            }
          }
        }
      }
    })

    if (!forum) {
      throw new NotFoundException('Forum không tồn tại')
    }

    return forum
  }

  async update(id: string, dto: UpdateForumDto) {
    const forum = await this.prisma.forum.findUnique({
      where: { id: BigInt(id) }
    })

    if (!forum) {
      throw new NotFoundException('Forum không tồn tại')
    }

    return this.prisma.forum.update({
      where: { id: BigInt(id) },
      data: {
        short_description: dto.short_description,
        long_description: dto.long_description,
        thumbnail_url: dto.thumbnail_url
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            owner_id: true
          }
        }
      }
    })
  }

  async remove(id: string) {
    const forum = await this.prisma.forum.findUnique({
      where: { id: BigInt(id) }
    })

    if (!forum) {
      throw new NotFoundException('Forum không tồn tại')
    }

    return this.prisma.forum.delete({
      where: { id: BigInt(id) }
    })
  }
}
