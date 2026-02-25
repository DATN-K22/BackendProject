import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger'
import { ForumService } from './forum.service'
import { CreateForumDto } from './dto/create-forum.dto'
import { UpdateForumDto } from './dto/update-forum.dto'

@ApiTags('Forums')
@Controller('forums')
export class ForumController {
  constructor(private readonly forumService: ForumService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo forum mới cho khóa học' })
  @ApiResponse({ status: 201, description: 'Forum được tạo thành công' })
  @ApiResponse({ status: 400, description: 'Khóa học đã có forum' })
  create(@Body() dto: CreateForumDto) {
    return this.forumService.create(dto)
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách forums' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'course_id', required: false, type: String })
  findAll(@Query('skip') skip?: string, @Query('take') take?: string, @Query('course_id') courseId?: string) {
    return this.forumService.findAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      courseId: courseId ? BigInt(courseId) : undefined
    })
  }

  @Get('course/:courseId')
  @ApiOperation({ summary: 'Lấy forum theo course_id' })
  @ApiResponse({ status: 200, description: 'Thông tin forum' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy forum' })
  findByCourseId(@Param('courseId') courseId: string) {
    return this.forumService.findByCourseId(courseId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin forum theo ID' })
  @ApiResponse({ status: 200, description: 'Thông tin forum' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy forum' })
  findOne(@Param('id') id: string) {
    return this.forumService.findOne(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật forum' })
  @ApiResponse({ status: 200, description: 'Forum được cập nhật thành công' })
  update(@Param('id') id: string, @Body() dto: UpdateForumDto) {
    return this.forumService.update(id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa forum' })
  @ApiResponse({ status: 200, description: 'Forum được xóa thành công' })
  remove(@Param('id') id: string) {
    return this.forumService.remove(id)
  }
}
