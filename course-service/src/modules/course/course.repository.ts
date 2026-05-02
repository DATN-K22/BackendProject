import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateCourseDto } from './dto/request/create-course.dto'
import { UpdateCourseDto } from './dto/request/update-course.dto'
import { Course, Prisma } from '@prisma/client'

@Injectable()
export class CourseRepositoy {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createCourseDto: CreateCourseDto) {
    const record = await this.prismaService.course.create({
      data: {
        owner_id: createCourseDto.owner_id,
        title: createCourseDto.title,
        short_description: createCourseDto.short_description,
        long_description: createCourseDto.long_description,
        thumbnail_url: createCourseDto.thumbnail_url,
        price: createCourseDto.price,
        status: createCourseDto.status as any
      }
    })
    return {
      ...record,
      id: record.id.toString()
    }
  }

  async update(updateCourseDto: UpdateCourseDto, courseId: number) {
    const record = await this.prismaService.course.update({
      data: updateCourseDto,
      where: { id: courseId }
    })
    return {
      ...record,
      id: record.id.toString()
    }
  }
  async findOne(id: string, userId: string) {
    const course = await this.prismaService.course.findFirst({
      where: {
        id: BigInt(id)
      },
      include: {
        enrollments: {
          where: {
            user_id: userId
          },
          select: {
            id: true,
            complete_percent: true
          }
        }
      }
    })

    if (!course) return null

    return {
      ...course,
      isEnrolled: course.enrollments.length > 0
    }
  }
  // async findAll(offset: number, limit: number) {
  //   const [courses, totalItems] = await Promise.all([
  //     this.prismaService.course.findMany({
  //       skip: offset,
  //       take: limit,
  //       orderBy: { created_at: 'desc' }
  //     }),
  //     this.prismaService.course.count()
  //   ]);
  //   return {
  //     courses,
  //     page: {
  //       total_pages: Math.ceil(totalItems / limit),
  //       total_items: totalItems,
  //       offset: offset,
  //       limit: limit
  //     }
  //   };
  // }

  async getLatestIncompleteCourseForUser(userId: string, offset: number, limit: number) {
    const result = await this.prismaService.$queryRawUnsafe<
      {
        id: string
        owner_id: string
        title: string
        thumbnail_url: string
        progress: number
      }[]
    >(
      `
    SELECT 
      c.id,
      c.owner_id,
      c.title,
      c.thumbnail_url,
      e.complete_percent as progress 
    FROM "course_service"."Enrollment" e
    JOIN "course_service"."Course" c ON e.course_id = c.id
    LEFT JOIN "course_service"."Chapter" ch ON ch.course_id = c.id
    LEFT JOIN "course_service"."ChapterItem" ci
      ON ci.chapter_id = ch.id
     AND ci.item_type = 'lesson'
    LEFT JOIN "course_service"."ChapterItemStatus" cis
      ON cis.chapter_item_id = ci.id
     AND cis.user_id = e.user_id
     AND cis.completed = true
    WHERE e.user_id = $1
    GROUP BY 
      c.id, 
      c.owner_id, 
      c.title, 
      c.thumbnail_url, 
      e.complete_percent, 
      e.enrolled_at
    HAVING
      COUNT(DISTINCT ci.id) > COUNT(DISTINCT cis.chapter_item_id)
      OR e.complete_percent = 0
    ORDER BY
      MAX(COALESCE(cis.updated_at, e.enrolled_at)) DESC
    LIMIT $2
    OFFSET $3
  `,
      userId,
      Number(limit),
      Number(offset)
    )
    return result
  }

  async getRecommendationCourses(offset: number, limit: number) {
    return this.prismaService.course.findMany({
      skip: offset,
      take: limit,
      orderBy: [{ rating: 'desc' }, { created_at: 'desc' }],
      select: {
        id: true,
        owner_id: true,
        title: true,
        thumbnail_url: true,
        rating: true,
        short_description: true,
        price: true,
        created_at: true
      }
    })
  }
  async getEnrolledCourses(userId: string, offset: number, limit: number) {
    const [data, totalItems] = await Promise.all([
      this.prismaService.course.findMany({
        where: {
          enrollments: {
            some: {
              user_id: userId
            }
          }
        },
        skip: offset,
        take: limit
      }),
      this.prismaService.course.count({
        where: {
          enrollments: {
            some: {
              user_id: userId
            }
          }
        }
      })
    ])
    Logger.log(`Total enrolled courses for user ${userId}: ${totalItems}`)
    return { data, totalItems }
  }

  async findCourseById(courseId: bigint) {
    return this.prismaService.course.findUnique({
      where: { id: courseId },
      select: { id: true, owner_id: true, status: true }
    })
  }

  async findEnrollment(userId: string, courseId: bigint) {
    return this.prismaService.enrollment.findFirst({
      where: { user_id: userId, course_id: courseId }
    })
  }

  async createEnrollment(userId: string, courseId: bigint) {
    return this.prismaService.enrollment.create({
      data: {
        user_id: userId,
        course_id: courseId
      }
    })
  }
}
