import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger'
import { LessonService } from './lesson.service'
import { CreateLessonDto } from './dto/create-lesson.dto'
import { UpdateLessonDto } from './dto/update-lesson.dto'
import { ApiResponse as ApiSwaggerResponse } from '../../utils/dto/ApiResponse'
@ApiTags('Lessons')
@Controller('lessons')
export class LessonController {
  constructor(private readonly lessonService: LessonService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo lesson mới' })
  @ApiResponse({ status: 201, description: 'Lesson được tạo thành công' })
  create(@Body() dto: CreateLessonDto) {
    return this.lessonService.create(dto)
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách lessons' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'chapter_id', required: false, type: String })
  findAll(@Query('skip') skip?: string, @Query('take') take?: string, @Query('chapter_id') chapterId?: string) {
    return this.lessonService.findAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      chapterId: chapterId ? BigInt(chapterId) : undefined
    })
  }

  @Patch(':courseId/:lessonId/status')
  async markLearnedLesson(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @Headers('x-user-id') userId: string
  ) {
    return ApiSwaggerResponse.OkResponse(await this.lessonService.markLearnedLesson(userId, lessonId, courseId))
  }

  // @Patch(':id')
  // @ApiOperation({ summary: 'Cập nhật lesson' })
  // @ApiResponse({ status: 200, description: 'Lesson được cập nhật thành công' })
  // update(@Param('id') id: string, @Body() dto: UpdateLessonDto) {
  //   return this.lessonService.update(id, dto)
  // }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa lesson' })
  @ApiResponse({ status: 200, description: 'Lesson được xóa thành công' })
  remove(@Param('id') id: string) {
    return this.lessonService.remove(id)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin lesson theo ID' })
  @ApiResponse({ status: 200, description: 'Thông tin lesson' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lesson' })
  async findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return ApiSwaggerResponse.OkResponse(await this.lessonService.getLessonByIdWithValidateUserEnrollment(id, userId))
  }
}
