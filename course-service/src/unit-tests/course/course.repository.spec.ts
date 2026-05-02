import { Test, TestingModule } from '@nestjs/testing'
import { CourseRepositoy } from '../../modules/course/course.repository'
import { PrismaService } from '../../prisma/prisma.service'

const mockPrisma = {
  course: {
    create: jest.fn(),
    update: jest.fn(),
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
      providers: [CourseRepositoy, { provide: PrismaService, useValue: mockPrisma }]
    }).compile()

    repository = module.get<CourseRepositoy>(CourseRepositoy)
    jest.clearAllMocks()
  })

  it('should create course and stringify id', async () => {
    mockPrisma.course.create.mockResolvedValue({ id: 1n, title: 'Course 1' })

    const result = await repository.create({
      owner_id: 'owner-1',
      title: 'Course 1',
      short_description: 'short',
      long_description: 'long',
      thumbnail_url: 'thumb',
      price: '1000',
      status: 'draft'
    } as any)

    expect(mockPrisma.course.create).toHaveBeenCalledWith({
      data: {
        owner_id: 'owner-1',
        title: 'Course 1',
        short_description: 'short',
        long_description: 'long',
        thumbnail_url: 'thumb',
        price: '1000',
        status: 'draft'
      }
    })
    expect(result).toEqual({ id: '1', title: 'Course 1' })
  })

  it('should update course and stringify id', async () => {
    mockPrisma.course.update.mockResolvedValue({ id: 2n, title: 'Updated' })

    const result = await repository.update({ title: 'Updated' } as any, 2)

    expect(mockPrisma.course.update).toHaveBeenCalledWith({
      data: { title: 'Updated' },
      where: { id: 2 }
    })
    expect(result).toEqual({ id: '2', title: 'Updated' })
  })

  it('should find course and derive enrollment state', async () => {
    mockPrisma.course.findFirst.mockResolvedValue({
      id: 1n,
      owner_id: 'owner-1',
      enrollments: [{ id: 1, complete_percent: 50 }]
    })

    const result = await repository.findOne('1', 'user-1')

    expect(mockPrisma.course.findFirst).toHaveBeenCalledWith({
      where: { id: 1n },
      include: {
        enrollments: {
          where: { user_id: 'user-1' },
          select: { id: true, complete_percent: true }
        }
      }
    })
    expect(result).toEqual({
      id: 1n,
      owner_id: 'owner-1',
      enrollments: [{ id: 1, complete_percent: 50 }],
      isEnrolled: true
    })
  })

  it('should return null when course is not found', async () => {
    mockPrisma.course.findFirst.mockResolvedValue(null)

    const result = await repository.findOne('999', 'user-1')

    expect(result).toBeNull()
  })

  it('should query latest incomplete courses with raw sql args', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ id: '1' }])

    const result = await repository.getLatestIncompleteCourseForUser('user-1', 10, 20)

    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('FROM "course_service"."Enrollment"'),
      'user-1',
      20,
      10
    )
    expect(result).toEqual([{ id: '1' }])
  })

  it('should query recommendation courses with select fields', async () => {
    mockPrisma.course.findMany.mockResolvedValue([{ id: 1n }])

    const result = await repository.getRecommendationCourses(0, 5)

    expect(mockPrisma.course.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 5,
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
    expect(result).toEqual([{ id: 1n }])
  })

  it('should return enrolled courses and total count', async () => {
    mockPrisma.course.findMany.mockResolvedValue([{ id: 1n }])
    mockPrisma.course.count.mockResolvedValue(1)

    const result = await repository.getEnrolledCourses('user-1', 0, 10)

    expect(mockPrisma.course.findMany).toHaveBeenCalledWith({
      where: { enrollments: { some: { user_id: 'user-1' } } },
      skip: 0,
      take: 10
    })
    expect(mockPrisma.course.count).toHaveBeenCalledWith({
      where: { enrollments: { some: { user_id: 'user-1' } } }
    })
    expect(result).toEqual({ data: [{ id: 1n }], totalItems: 1 })
  })

  it('should find course by id with projected fields', async () => {
    mockPrisma.course.findUnique.mockResolvedValue({ id: 1n })

    const result = await repository.findCourseById(1n)

    expect(mockPrisma.course.findUnique).toHaveBeenCalledWith({
      where: { id: 1n },
      select: { id: true, owner_id: true, status: true }
    })
    expect(result).toEqual({ id: 1n })
  })

  it('should find enrollment by user and course ids', async () => {
    mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 1n })

    const result = await repository.findEnrollment('user-1', 1n)

    expect(mockPrisma.enrollment.findFirst).toHaveBeenCalledWith({
      where: { user_id: 'user-1', course_id: 1n }
    })
    expect(result).toEqual({ id: 1n })
  })

  it('should create enrollment', async () => {
    mockPrisma.enrollment.create.mockResolvedValue({ id: 1n })

    const result = await repository.createEnrollment('user-1', 1n)

    expect(mockPrisma.enrollment.create).toHaveBeenCalledWith({
      data: { user_id: 'user-1', course_id: 1n }
    })
    expect(result).toEqual({ id: 1n })
  })
})
