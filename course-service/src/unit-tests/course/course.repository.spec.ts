import { Test, TestingModule } from '@nestjs/testing'
import { CourseRepositoy } from '../../modules/course/course.repository'
import { PrismaService } from '../../prisma/prisma.service'

const mockPrisma = {
  course: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn()
  },

  enrollment: {
    findFirst: jest.fn(),
    create: jest.fn()
  },

  $queryRawUnsafe: jest.fn()
}

describe('CourseRepositoy', () => {
  let repository: CourseRepositoy

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseRepositoy,
        {
          provide: PrismaService,
          useValue: mockPrisma
        }
      ]
    }).compile()

    repository = module.get<CourseRepositoy>(CourseRepositoy)

    jest.clearAllMocks()
  })

  describe('create', () => {
    it('should create course with all fields', async () => {
      mockPrisma.course.create.mockResolvedValue({
        id: 6n,
        owner_id: 'owner-1',
        title: 'AWS Course',
        short_description: 'Learn AWS',
        long_description: 'Detailed',
        thumbnail_url: 'thumb.jpg',
        price: '100000',
        status: 'draft',
        created_at: new Date()
      })

      const result = await repository.create({
        owner_id: 'owner-1',
        title: 'AWS Course',
        short_description: 'Learn AWS',
        long_description: 'Detailed',
        thumbnail_url: 'thumb.jpg',
        price: '100000',
        status: 'draft'
      } as any)

      expect(mockPrisma.course.create).toHaveBeenCalledWith({
        data: {
          owner_id: 'owner-1',
          title: 'AWS Course',
          short_description: 'Learn AWS',
          long_description: 'Detailed',
          thumbnail_url: 'thumb.jpg',
          price: '100000',
          status: 'draft'
        }
      })

      expect(result.id).toBe('6')
      expect(result.title).toBe('AWS Course')
    })
  })

  describe('update', () => {
    it('should update course and stringify id', async () => {
      mockPrisma.course.update.mockResolvedValue({
        id: 1n,
        title: 'Updated Course'
      })

      const result = await repository.update(
        {
          title: 'Updated Course'
        } as any,
        1
      )

      expect(mockPrisma.course.update).toHaveBeenCalledWith({
        data: {
          title: 'Updated Course'
        },
        where: {
          id: 1
        }
      })

      expect(result.id).toBe('1')
    })
  })

  describe('findOne', () => {
    it('should find course and derive enrollment state', async () => {
      mockPrisma.course.findFirst.mockResolvedValue({
        id: 1n,
        owner_id: 'owner-1',
        title: 'Course 1',
        enrollments: [
          {
            id: 1,
            complete_percent: 50
          }
        ]
      })

      const result = await repository.findOne('1', 'user-1')

      expect(mockPrisma.course.findFirst).toHaveBeenCalledWith({
        where: {
          id: 1n
        },
        include: {
          enrollments: {
            where: {
              user_id: 'user-1'
            },
            select: {
              id: true,
              complete_percent: true
            }
          }
        }
      })

      expect(result?.isEnrolled).toBe(true)
    })

    it('should return null when course not found', async () => {
      mockPrisma.course.findFirst.mockResolvedValue(null)

      const result = await repository.findOne('999', 'user-1')

      expect(result).toBeNull()
    })

    it('should mark as not enrolled when no enrollment exists', async () => {
      mockPrisma.course.findFirst.mockResolvedValue({
        id: 1n,
        owner_id: 'owner-1',
        enrollments: []
      })

      const result = await repository.findOne('1', 'user-1')

      expect(result?.isEnrolled).toBe(false)
    })
  })

  describe('findAll', () => {
    it('should return all courses with pagination', async () => {
      mockPrisma.course.findMany.mockResolvedValue([
        { id: 1n, title: 'Course 1' },
        { id: 2n, title: 'Course 2' }
      ])

      mockPrisma.course.count.mockResolvedValue(2)

      const result = await repository.findAll(1, 10)

      expect(mockPrisma.course.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: {
          created_at: 'desc'
        },
        where: undefined
      })

      expect(result.totalItems).toBe(2)
      expect(result.data).toHaveLength(2)
    })

    it('should filter by owner_id', async () => {
      mockPrisma.course.findMany.mockResolvedValue([
        {
          id: 1n,
          title: 'Course 1'
        }
      ])

      mockPrisma.course.count.mockResolvedValue(1)

      await repository.findAll(1, 10, 'user-1')

      expect(mockPrisma.course.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: {
          created_at: 'desc'
        },
        where: {
          owner_id: 'user-1'
        }
      })
    })
  })

  describe('delete', () => {
    it('should delete course by id', async () => {
      mockPrisma.course.delete.mockResolvedValue({
        id: 1n
      })

      await repository.delete(1)

      expect(mockPrisma.course.delete).toHaveBeenCalledWith({
        where: {
          id: 1
        }
      })
    })
  })

  describe('getLatestIncompleteCourseForUser', () => {
    it('should query latest incomplete courses for user', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: '1',
          owner_id: 'owner-1',
          title: 'Course 1',
          progress: 30
        }
      ])

      const result = await repository.getLatestIncompleteCourseForUser('user-1', 10, 20)

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FROM "course_service"."Enrollment"'),
        'user-1',
        20,
        10
      )

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('1')
    })
  })

  describe('getRecommendationCourses', () => {
    it('should return courses sorted by rating and creation date', async () => {
      mockPrisma.course.findMany.mockResolvedValue([
        {
          id: 1n,
          title: 'Top Course',
          rating: 5
        }
      ])

      const result = await repository.getRecommendationCourses(0, 10)

      expect(mockPrisma.course.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: [
          {
            rating: 'desc'
          },
          {
            created_at: 'desc'
          }
        ],
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

      expect(result).toHaveLength(1)
    })
  })

  describe('getEnrolledCourses', () => {
    it('should return courses user is enrolled in with pagination', async () => {
      mockPrisma.course.findMany.mockResolvedValue([
        {
          id: 1n,
          title: 'Enrolled'
        }
      ])

      mockPrisma.course.count.mockResolvedValue(1)

      const result = await repository.getEnrolledCourses('user-1', 1, 10)

      expect(mockPrisma.course.findMany).toHaveBeenCalledWith({
        where: {
          enrollments: {
            some: {
              user_id: 'user-1'
            }
          }
        },
        skip: 0,
        take: 10
      })

      expect(result.totalItems).toBe(1)
      expect(result.data).toHaveLength(1)
    })
  })

  describe('findCourseById', () => {
    it('should return course by id', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 1n,
        owner_id: 'owner-1',
        status: 'published'
      })

      const result = await repository.findCourseById(1n)

      expect(mockPrisma.course.findUnique).toHaveBeenCalledWith({
        where: {
          id: 1n
        },
        select: {
          id: true,
          owner_id: true,
          status: true
        }
      })

      expect(result?.id).toBe(1n)
    })
  })

  describe('findEnrollment', () => {
    it('should find enrollment for user and course', async () => {
      mockPrisma.enrollment.findFirst.mockResolvedValue({
        id: 1,
        user_id: 'user-1',
        course_id: 1n
      })

      const result = await repository.findEnrollment('user-1', 1n)

      expect(mockPrisma.enrollment.findFirst).toHaveBeenCalledWith({
        where: {
          user_id: 'user-1',
          course_id: 1n
        }
      })

      expect(result).toMatchObject({
        id: 1
      })
    })
  })

  describe('createEnrollment', () => {
    it('should create enrollment for user and course', async () => {
      mockPrisma.enrollment.create.mockResolvedValue({
        id: 1,
        user_id: 'user-1',
        course_id: 1n
      })

      await repository.createEnrollment('user-1', 1n)

      expect(mockPrisma.enrollment.create).toHaveBeenCalledWith({
        data: {
          user_id: 'user-1',
          course_id: 1n
        }
      })
    })
  })
})
