import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger'
import { ChapterService } from './chapter.service'
import { CreateChapterDto } from './dto/create-chapter.dto'
import { UpdateChapterDto } from './dto/update-chapter.dto'
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

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách chapters' })
  async findAll(@Headers('x-user-id') userId: string, @Query('course_id') courseId?: string) {
    return ApiSwaggerResponse.OkResponse(
      await this.chapterService.findAll(courseId ? BigInt(courseId) : undefined, userId),
      'Get list of chapter by course id successfully'
    )
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chapter theo ID' })
  @ApiResponse({ status: 200, description: 'Thông tin chapter' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy chapter' })
  findOne(@Param('id') id: string) {
    return this.chapterService.findOne(id)
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
