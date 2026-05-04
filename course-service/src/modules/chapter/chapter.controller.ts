import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger'
import { ChapterService } from './chapter.service'
import { CreateChapterDto } from './dto/create-chapter.dto'
import { UpdateChapterDto } from './dto/update-chapter.dto'
import { UpdateChapterOrderDto } from './dto/update-chapter-order.dto'
import { ApiResponse as ApiSwaggerResponse } from '../../utils/dto/ApiResponse'
@ApiTags('Chapters')
@Controller('chapters')
export class ChapterController {
  constructor(private readonly chapterService: ChapterService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo chapter mới' })
  @ApiResponse({ status: 201, description: 'Chapter được tạo thành công' })
  create(@Body() dto: CreateChapterDto) {
    return this.chapterService.create(dto)
  }

  @Get('/TOC')
  @ApiOperation({ summary: 'get list of chapters for table of content' })
  async findAllChapterForTOC(@Headers('x-user-id') userId: string, @Query('course_id') courseId: string) {
    return ApiSwaggerResponse.OkResponse(
      await this.chapterService.findAllChapterForTOC(courseId, userId),
      'Get list of chapter by course id successfully'
    )
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách chapters' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'course_id', required: false, type: String })
  findAll(@Query('skip') skip?: string, @Query('take') take?: string, @Query('course_id') courseId?: string) {
    return this.chapterService.findAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      courseId: courseId ? BigInt(courseId) : undefined
    })
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chapter theo ID' })
  @ApiResponse({ status: 200, description: 'Thông tin chapter' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy chapter' })
  findOne(@Param('id') id: string) {
    return this.chapterService.findOne(id)
  }

  @Patch(':course_id/order')
  @ApiOperation({ summary: 'Cập nhật thứ tự sắp xếp chapters' })
  @ApiResponse({ status: 200, description: 'Thứ tự sắp xếp được cập nhật thành công' })
  updateOrder(@Param('course_id') course_id: string, @Body() dto: UpdateChapterOrderDto) {
    return this.chapterService.updateOrder(course_id, dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật chapter' })
  @ApiResponse({ status: 200, description: 'Chapter được cập nhật thành công' })
  update(@Param('id') id: string, @Body() dto: UpdateChapterDto) {
    return this.chapterService.update(id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa chapter' })
  @ApiResponse({ status: 200, description: 'Chapter được xóa thành công' })
  remove(@Param('id') id: string) {
    return this.chapterService.remove(id)
  }
}
