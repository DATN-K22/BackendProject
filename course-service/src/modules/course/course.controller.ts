import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { CourseService } from './course.service'
import { CreateCourseDto } from './dto/create-course.dto'
import { UpdateCourseDto } from './dto/update-course.dto'

@Controller('courses')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Post()
  create(@Body() dto: CreateCourseDto) {
    return this.courseService.create(dto)
  }

  @Get()
  findAll(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.courseService.findAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined
    })
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.courseService.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.courseService.update(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.courseService.remove(id)
  }
}
