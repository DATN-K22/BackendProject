import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Headers } from '@nestjs/common'
import { CourseService } from './course.service'
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResponse } from '../../utils/dto/ApiResponse'
import { CreateCourseDto } from './dto/request/create-course.dto'
import { UpdateCourseDto } from './dto/request/update-course.dto'
import { IncompleteCourse } from './dto/response/IncompleteCourseResponse'
import { CourseDetailResponse } from './dto/response/CourseDetailResponse'
import { PaginationDto } from '../../utils/dto/PagnitionDto'
import { ApiSuccessResponse } from '../../utils/helper/api-success-response.decorator'
import { CoursesListResponse } from './dto/response/CourseslListResponse'

@Controller('course')
@ApiTags('Course Management APIsl')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new course' })
  @ApiBody({ type: CreateCourseDto })
  @ApiOkResponse({
    schema: {
      example: {
        success: true,
        code: 201,
        message: 'Create Course successfully',
        data: {
          id: '6',
          owner_id: 'E.g: 1',
          title: 'AWS Certified Solutions Architect - Associate (SAA-C03): Scaling and Decoupling Architectures',
          short_description: '',
          long_description: 'Course description',
          thumbnail_url: '',
          price: '100000',
          status: 'draft',
          created_at: '2026-02-01T07:43:21.334Z',
          enrollments: []
        },
        timestamp: '2024-10-01T12:34:56.789Z'
      }
    }
  })
  async create(@Body() createCourseDto: CreateCourseDto) {
    return ApiResponse.OkCreateResponse(await this.courseService.create(createCourseDto), 'Create Course successfully')
  }

  @Get()
  @ApiOperation({ summary: 'Get all courses', description: 'Retrieve a list of all available courses with pagnition' })
  @ApiBody({
    type: PaginationDto
  })
  @ApiSuccessResponse(CoursesListResponse)
  async findAll(@Query('offset') offset: string, @Query('limit') limit: string, @Query('owner_id') ownerId?: string) {
    return ApiResponse.OkResponse(
      await this.courseService.findAll(+offset, +limit, ownerId),
      'Get all courses successfully'
    )
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get the detail information of a course by its id',
    description: `
      This API returns: 
      - Detailed information on a course,  
      - TOC, and 
      - Checks the enrollment of that user and the progression of that user if enrolled
    `
  })
  @ApiOkResponse({ type: CourseDetailResponse })
  async findOne(@Headers('x-user-id') userId: string, @Param('id') id: string, @Query('include') include: string) {
    return ApiResponse.OkResponse(
      await this.courseService.findOne(id, userId, include),
      "Get course's detail successfully"
    )
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update metadata of a course' })
  @ApiBody({ type: UpdateCourseDto })
  @ApiOkResponse({
    schema: {
      example: {
        success: true,
        code: 200,
        message: 'Update course successfully',
        data: {
          id: '6',
          owner_id: 'E.g: 1',
          title: 'AWS Certified Solutions Architect - Associate (SAA-C03): Scaling and Decoupling Architectures',
          short_description: '',
          long_description: 'Course description',
          thumbnail_url: '',
          price: '100000',
          status: 'draft',
          created_at: '2026-02-01T07:43:21.334Z',
          enrollments: []
        },
        timestamp: '2024-10-01T12:34:56.789Z'
      }
    }
  })
  async update(@Param('id') id: string, @Body() updateCourseDto: UpdateCourseDto) {
    return ApiResponse.OkResponse(await this.courseService.update(+id, updateCourseDto), 'Update course successfully')
  }

  @Get('/me/latest-incomplete')
  @ApiOperation({ summary: "Get all the latest courses that user hasn't finished yet" })
  @ApiOkResponse({ type: [IncompleteCourse] })
  async getLatestIncompleteCourseForUser(
    @Query('offset') offset: string = '0',
    @Headers('x-user-id') userId: string,
    @Query('limit') limit: string = '10'
  ) {
    return ApiResponse.OkResponse(
      await this.courseService.getLatestIncompleteCourseForUser(userId, +offset, +limit),
      'Get latest incomplete course for user successfully'
    )
  }

  @Get('/me/recommendation')
  @ApiOperation({ summary: 'Get courses that is recommended for user' })
  async getRecommendationCourses(@Query('offset') offset: string = '0', @Query('limit') limit: string = '10') {
    return ApiResponse.OkResponse(
      await this.courseService.getRecommendationCourses(+offset, +limit),
      `Get recommendation courses successfully`
    )
  }

  @Get('/me/enrolled')
  @ApiOperation({ summary: 'Get courses that user has enrolled in' })
  async getEnrolledCourses(
    @Headers('x-user-id') userId: string,
    @Query('offset') offset: string = '0',
    @Query('limit') limit: string = '10'
  ) {
    return ApiResponse.OkResponse(
      await this.courseService.getEnrolledCourses(userId, +offset, +limit),
      'Get enrolled courses successfully'
    )
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a course by id' })
  @ApiOkResponse({
    schema: {
      example: {
        success: true,
        code: 200,
        message: 'Delete course successfully',
        data: null,
        timestamp: '2024-10-01T12:34:56.789Z'
      }
    }
  })
  async remove(@Param('id') id: string) {
    await this.courseService.remove(+id)
    return ApiResponse.OkResponse(null, 'Delete course successfully')
  }
}
