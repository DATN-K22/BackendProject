// Duplicate method removed. Only keep the method inside the class.
// Duplicate method removed. Only keep the method inside the class.
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateCourseDto } from './dto/request/create-course.dto'
import { UpdateCourseDto } from './dto/request/update-course.dto'
import { Prisma } from '@prisma/client'
import { FilterOptionDto } from './dto/request/filter-option.dto'
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
  async findAll(offset: number, limit: number) {
    const skip = (offset - 1) * limit
    const [data, totalItems] = await Promise.all([
      this.prismaService.course.findMany({
        skip: skip,
        take: limit,
        orderBy: { created_at: 'desc' }
      }),
      this.prismaService.course.count({})
    ])

    return {
      data,
      totalItems
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
    const skip = (offset - 1) * limit
    const [data, totalItems] = await Promise.all([
      this.prismaService.course.findMany({
        where: {
          enrollments: {
            some: {
              user_id: userId
            }
          }
        },
        skip: skip,
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
  // course.repository.ts

  async searchCourses(filters: FilterOptionDto) {
    const { page = 1, limit = 10, q } = filters
    const offset = (page - 1) * limit

    // Bước 1: Build WHERE clause với filtering
    const where = await this.buildSearchWhereClause(filters)

    // Nếu không có keyword và filter không match, trả về empty
    if (where === null) {
      return {
        courses: [],
        meta: { totalItems: 0, page, limit, totalPages: 0 },
        facets: { levels: {}, priceTypes: { FREE: 0, PAID: 0 } }
      }
    }

    // Bước 2: Nếu có keyword search, sử dụng fullTextSearchWithCount
    let courses: any[] = []
    let totalItems: number = 0

    if (q && q.trim()) {
      const ftsResult = await this.prismaService.fullTextSearchWithCount({
        modelName: 'Course',
        query: q,
        lang: 'english',
        limit: limit,
        offset: offset
      })

      courses = ftsResult.data as any[]
      totalItems = ftsResult.total || 0

      // Apply thêm các filter (levels, price, status) vào FTS results
      courses = courses.filter((course) => {
        const matchesStatus = course.status === 'published'
        const matchesLevel =
          !filters.levels || filters.levels.length === 0 || filters.levels.includes(course.course_level)
        const matchesPrice = this.matchesPrice(course.price, filters)
        return matchesStatus && matchesLevel && matchesPrice
      })

      // Đếm lại total sau khi filter
      totalItems = courses.length
    } else {
      // Không có keyword, sử dụng Prisma normal query với filter
      const [queryResult, count] = await Promise.all([
        this.prismaService.course.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: { created_at: 'desc' }
        }),
        this.prismaService.course.count({ where })
      ])

      courses = queryResult
      totalItems = count
    }

    // Trả về empty nếu không có results
    if (!courses || courses.length === 0) {
      return {
        courses: [],
        meta: { totalItems: 0, page, limit, totalPages: 0 },
        facets: { levels: {}, priceTypes: { FREE: 0, PAID: 0 } }
      }
    }

    // Bước 3: FACETED SEARCH - count dựa trên current filtered results + filter options
    // Tính facets cho tất cả courses có status = published (independent của search keyword)
    const baseWhere = { status: 'published' as const }

    const [levelFacets, freeCountResult, paidCountResult] = await Promise.all([
      // Count courses by level (published)
      this.prismaService.course.groupBy({
        by: ['course_level'],
        where: baseWhere,
        _count: { course_level: true }
      }),
      // Count free courses (published)
      this.prismaService.course.count({
        where: { ...baseWhere, price: 0 }
      }),
      // Count paid courses (published)
      this.prismaService.course.count({
        where: { ...baseWhere, price: { gt: 0 } }
      })
    ])

    const formattedLevelFacets = levelFacets.reduce(
      (acc, curr) => {
        acc[curr.course_level] = curr._count.course_level
        return acc
      },
      {} as Record<string, number>
    )

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
          FREE: freeCountResult,
          PAID: paidCountResult
        }
      }
    }
  }

  /**
   * Build WHERE clause cho Prisma query
   * Trả về null nếu filter không có kết quả
   */
  private async buildSearchWhereClause(filters: FilterOptionDto): Promise<Prisma.CourseWhereInput | null> {
    const { levels, isPaid, minPrice, maxPrice } = filters
    const where: Prisma.CourseWhereInput = { status: 'published' }

    // Filter by course level
    if (levels && levels.length > 0) {
      where.course_level = { in: levels as any }
    }

    // Filter by price
    if (isPaid === false) {
      // Free courses only
      where.price = 0
    } else if (isPaid === true) {
      // Paid courses only
      where.price = { gt: 0 }

      // Apply min/max price for paid courses
      const priceFilter: any = { gt: 0 }
      if (minPrice !== undefined && minPrice > 0) {
        priceFilter.gte = minPrice
      }
      if (maxPrice !== undefined) {
        priceFilter.lte = maxPrice
      }
      where.price = priceFilter
    } else {
      // isPaid is undefined - no price filter for FREE/PAID distinction
      // But still apply minPrice/maxPrice if provided
      if (minPrice !== undefined || maxPrice !== undefined) {
        const priceFilter: any = {}
        if (minPrice !== undefined) {
          priceFilter.gte = minPrice
        }
        if (maxPrice !== undefined) {
          priceFilter.lte = maxPrice
        }
        where.price = priceFilter
      }
    }

    return where
  }

  /**
   * Check if course price matches filter criteria
   */
  private matchesPrice(price: number, filters: FilterOptionDto): boolean {
    const numPrice = typeof price === 'number' ? price : parseFloat(price == null ? '0' : String(price))
    const { isPaid, minPrice, maxPrice } = filters

    if (isPaid === false && numPrice !== 0) return false
    if (isPaid === true && numPrice === 0) return false

    if (minPrice !== undefined && numPrice < minPrice) return false
    if (maxPrice !== undefined && numPrice > maxPrice) return false

    return true
  }
}
