// Duplicate method removed. Only keep the method inside the class.
// Duplicate method removed. Only keep the method inside the class.
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateCourseDto } from './dto/request/create-course.dto'
import { UpdateCourseDto } from './dto/request/update-course.dto'
import { Prisma } from '@prisma/client'
import { FilterOptionDto } from './dto/request/filter-option.dto'
@Injectable()
export class CourseRepositoy {
  constructor(private readonly prismaService: PrismaService) { }

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
  async findAll(offset: number, limit: number, ownerId?: string) {
    const [courses, totalItems = 0] = await Promise.all([
      this.prismaService.course.findMany({
        skip: offset,
        take: limit,
        orderBy: { created_at: 'desc' },
        where: ownerId ? { owner_id: ownerId } : undefined
      })
      // this.prismaService.course.count()
    ])
    return {
      courses,
      page: {
        total_pages: Math.ceil(totalItems / limit),
        total_items: totalItems,
        offset: offset,
        limit: limit
      }
    }
  }

  async delete(id: number) {
    await this.prismaService.course.delete({
      where: {
        id: id
      }
    })
  }

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
  private async buildSearchWhereClause(filters: FilterOptionDto): Promise<Prisma.CourseWhereInput | null> {
    const { q, levels, isPaid, minPrice, maxPrice } = filters;
    const where: Prisma.CourseWhereInput = { status: 'published' };

    if (q) {
      const ftsResults = await this.prismaService.fullTextSearch({
        modelName: 'Course',
        query: q,
        limit: 100 // PrismaService có validate limit tối đa là 100
      });

      if (ftsResults.length === 0) return null; // Null indicates no results

      const matchIds = ftsResults.map((c: any) => BigInt(c.id));
      where.id = { in: matchIds };
    }

    if (levels && levels.length > 0) {
      where.course_level = { in: levels as any }; // Cast due to auto-generated type matching
    }

    // Logic giá
    if (isPaid === true) {
      where.price = { gt: 0 };
    } else if (isPaid === false) {
      where.price = 0;
    }

    // Lọc theo khoảng giá
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {
        ...(typeof where.price === 'object' ? where.price : {}),
        ...(minPrice !== undefined ? { gte: minPrice } : {}),
        ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
      };
    }

    return where;
  }

  async searchCourses(filters: FilterOptionDto) {
    const { page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;

    // 1. Lấy mệnh đề WHERE (trả về null nếu FTS không match kết quả nào)
    const where = await this.buildSearchWhereClause(filters);

    if (where === null) {
      return {
        courses: [],
        meta: { totalItems: 0, page, limit, totalPages: 0 },
        facets: { levels: {}, priceTypes: { FREE: 0, PAID: 0 } }
      };
    }

    // 2. Chạy Query lấy Data và đếm Total song song
    const [courses, totalItems] = await Promise.all([
      this.prismaService.course.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          title: true,
          thumbnail_url: true,
          price: true,
          course_level: true,
          rating: true,
          owner_id: true,
          short_description: true,
          created_at: true,
        }
      }),
      this.prismaService.course.count({ where })
    ]);

    // 3. FACETED SEARCH
    const [levelFacets, freeCount] = await Promise.all([
      this.prismaService.course.groupBy({
        by: ['course_level'],
        where,
        _count: { course_level: true }
      }),
      this.prismaService.course.count({
        where: { ...where, price: 0 }
      })
    ]);

    const formattedLevelFacets = levelFacets.reduce((acc, curr) => {
      acc[curr.course_level] = curr._count.course_level;
      return acc;
    }, {} as Record<string, number>);

    return {
      courses,
      meta: {
        totalItems,
        page,
        limit,
        totalPages: Math.ceil(totalItems / limit)
      },
      facets: {
        levels: formattedLevelFacets,
        priceTypes: {
          FREE: freeCount,
          PAID: totalItems - freeCount
        }
      }
    };
  }
}
