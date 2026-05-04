import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger'
import { LessonService } from './lesson.service'
import { CreateLessonDto } from './dto/create-lesson.dto'
import { UpdateLessonDto } from './dto/update-lesson.dto'
import { ApiResponse as ApiSwaggerResponse } from '../../utils/dto/ApiResponse'
import { UpdateLessonOrderDto } from './dto/update-chapter-order.dto'
@ApiTags('Lessons')
@Controller('lessons')
export class LessonController {
  constructor(private readonly lessonService: LessonService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo lesson mới' })
  @ApiResponse({ status: 201, description: 'Lesson được tạo thành công' })
  async create(@Body() dto: CreateLessonDto) {
    return ApiSwaggerResponse.OkResponse(await this.lessonService.create(dto), 'Lesson created successfully')
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách lessons' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'chapter_id', required: false, type: String })
  async findAll(@Query('skip') skip?: string, @Query('take') take?: string, @Query('chapter_id') chapterId?: string) {
    return ApiSwaggerResponse.OkResponse(
      await this.lessonService.findAll({
        skip: skip ? Number(skip) : undefined,
        take: take ? Number(take) : undefined,
        chapterId: chapterId ? BigInt(chapterId) : undefined
      })
    )
  }

  @Patch(':id/:courseId/:lessonId/status')
  async markLearnedChapterItem(
    @Param('courseId') courseId: string,
    @Param('lessonId') chapterItemId: string,
    @Param('id') userId: string
  ) {
    return ApiSwaggerResponse.OkResponse(
      await this.lessonService.markLearnedChapterItem(userId, chapterItemId, courseId)
    )
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật lesson' })
  @ApiResponse({ status: 200, description: 'Lesson được cập nhật thành công' })
  async update(@Param('id') id: string, @Body() dto: UpdateLessonDto) {
    return ApiSwaggerResponse.OkResponse(await this.lessonService.update(id, dto), 'Lesson updated successfully')
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa lesson' })
  @ApiResponse({ status: 200, description: 'Lesson được xóa thành công' })
  async remove(@Param('id') id: string) {
    return ApiSwaggerResponse.OkResponse(await this.lessonService.remove(id), 'Lesson deleted successfully')
  }

  @Get(':id/:userId')
  @ApiOperation({ summary: 'Lấy thông tin chapter item theo ID (lesson/lab/quiz)' })
  @ApiResponse({ status: 200, description: 'Thông tin chapter item' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy' })
  async findOne(@Param('id') id: string, @Param('userId') userId: string) {
    return ApiSwaggerResponse.OkResponse(
      await this.lessonService.getChapterItemByIdWithValidateUserEnrollment(id, userId)
    )
  }

  @Patch(':course_id/:chapter_id/order')
  @ApiOperation({ summary: 'Cập nhật thứ tự sắp xếp lessons trong một chapter' })
  @ApiResponse({ status: 200, description: 'Thứ tự sắp xếp được cập nhật thành công' })
  async updateLessonOrder(
    @Param('course_id') course_id: string,
    @Param('chapter_id') chapter_id: string,
    @Body() dto: UpdateLessonOrderDto
  ) {
    return ApiSwaggerResponse.OkResponse(
      await this.lessonService.updateLessonOrder(course_id, chapter_id, dto),
      'Update lesson order successfully'
    )
  }
}
