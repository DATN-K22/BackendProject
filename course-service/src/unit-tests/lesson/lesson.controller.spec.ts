import { Test, TestingModule } from '@nestjs/testing'
import { LessonController } from '../../modules/lesson/lesson.controller'
import { LessonService } from '../../modules/lesson/lesson.service'

const mockLessonService = {
  create: jest.fn(),
  findAll: jest.fn(),
  getChapterItemByIdWithValidateUserEnrollment: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  markLearnedChapterItem: jest.fn(),
  updateLessonOrder: jest.fn()
}

describe('LessonController', () => {
  let controller: LessonController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LessonController],
      providers: [{ provide: LessonService, useValue: mockLessonService }]
    }).compile()

    controller = module.get<LessonController>(LessonController)
    jest.clearAllMocks()
  })

  describe('create', () => {
    it('should create lesson and return ApiResponse', async () => {
      const createDto = {
        chapter_id: '100',
        title: 'Lesson 1',
        short_description: 'Introduction',
        long_description: 'Long description',
        status: 'published',
        duration: 30
      }
      const created = { id: 1n, ...createDto }

      mockLessonService.create.mockResolvedValue(created)

      const result = await controller.create(createDto as any)

      expect(mockLessonService.create).toHaveBeenCalledWith(createDto)
      expect(result).toMatchObject({
        success: true,
        data: created
      })
    })
  })

  describe('findAll', () => {
    it('should get all lessons with pagination', async () => {
      const lessons = [{ id: 1n, title: 'Lesson 1' }]

      mockLessonService.findAll.mockResolvedValue(lessons)

      const result = await controller.findAll('0', '10')

      expect(mockLessonService.findAll).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        chapterId: undefined
      })
      expect(result).toMatchObject({
        success: true,
        data: lessons
      })
    })

    it('should filter by chapter_id when provided', async () => {
      const lessons = [{ id: 1n, title: 'Lesson 1', chapter_id: 100n }]

      mockLessonService.findAll.mockResolvedValue(lessons)

      const result = await controller.findAll('0', '10', '100')

      expect(mockLessonService.findAll).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        chapterId: 100n
      })
    })
  })

  describe('update', () => {
    it('should update lesson and return ApiResponse', async () => {
      const updateDto = { title: 'Updated Lesson' }
      const updated = { id: 1n, ...updateDto }

      mockLessonService.update.mockResolvedValue(updated)

      const result = await controller.update('1', updateDto as any)

      expect(mockLessonService.update).toHaveBeenCalledWith('1', updateDto)
      expect(result).toMatchObject({
        success: true,
        data: updated
      })
    })
  })

  describe('remove', () => {
    it('should delete lesson and return ApiResponse', async () => {
      mockLessonService.remove.mockResolvedValue({ id: 1n })

      const result = await controller.remove('1')

      expect(mockLessonService.remove).toHaveBeenCalledWith('1')
      expect(result).toMatchObject({
        success: true,
        data: { id: 1n }
      })
    })
  })

  describe('markLearnedChapterItem', () => {
    it('should mark chapter item as learned', async () => {
      mockLessonService.markLearnedChapterItem.mockResolvedValue({ success: true })

      const result = await controller.markLearnedChapterItem('user-1', 'lesson-1', 'course-1')

      expect(mockLessonService.markLearnedChapterItem).toHaveBeenCalledWith('course-1', 'lesson-1', 'user-1')
      expect(result).toMatchObject({
        success: true,
        data: { success: true }
      })
    })
  })

  describe('findOne', () => {
    it('should get chapter item by id with user validation', async () => {
      const item = {
        id: '1',
        type: 'lesson',
        title: 'Lesson 1'
      }

      mockLessonService.getChapterItemByIdWithValidateUserEnrollment.mockResolvedValue(item)

      const result = await controller.findOne('1', 'user-1')

      expect(mockLessonService.getChapterItemByIdWithValidateUserEnrollment).toHaveBeenCalledWith('1', 'user-1')
      expect(result).toMatchObject({
        success: true,
        data: item
      })
    })
  })

  describe('updateLessonOrder', () => {
    it('should update lesson order in chapter', async () => {
      const dto = {
        lessons: [
          { lesson_id: '1', sort_order: 1 },
          { lesson_id: '2', sort_order: 2 }
        ]
      }

      mockLessonService.updateLessonOrder.mockResolvedValue({ success: true })

      const result = await controller.updateLessonOrder('course-1', 'chapter-1', dto as any)

      expect(mockLessonService.updateLessonOrder).toHaveBeenCalledWith('course-1', 'chapter-1', dto)
      expect(result).toMatchObject({
        success: true,
        data: { success: true }
      })
    })
  })
})
