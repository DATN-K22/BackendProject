import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Headers } from '@nestjs/common'
import { CourseService } from './course.service'
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResponse } from '../../utils/dto/ApiResponse'
import { CreateCourseDto } from './dto/request/create-course.dto'
import { UpdateCourseDto } from './dto/request/update-course.dto'
import { IncompleteCourse } from './dto/response/IncompleteCourseResponse'
import { CourseDetailResponse } from './dto/response/CourseDetailResponse'

@Controller('course')
@ApiTags('Course Management APIsl')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  // @Post()
  // @ApiOperation({ summary: 'Save a meatadata of a course' })
  // @ApiBody({ type: CreateCourseDto })
  // @ApiOkResponse({
  //   schema: {
  //     example: {
  //       success: true,
  //       code: 200,
  //       message: 'Presigned URL retrieved successfully.',
  //       data: {
  //         id: '6',
  //         owner_id: 'E.g: 1',
  //         title: 'AWS Certified Solutions Architect - Associate (SAA-C03): Scaling and Decoupling Architectures',
  //         short_description: '',
  //         long_description:
  //           'Becoming an AWS Solutions Architect requires that you have a deep understanding of the entire AWS ecosystem and an understanding of properly designing optimized, decoupled architectures. In this course, AWS Certified Solutions Architect - Associate (SAA-C03): Scaling and Decoupling Architectures, you’re going to learn to efficiently implement AWS services and best practices to achieve this. First, you’ll explore how to leverage Elastic Load Balancers to front Auto Scaling Groups for self-healing architectures, as well as implementing messaging queues via Amazon SQS. Next, you’ll discover how to leverage serverless options for event-driven designs, including Amazon ECS containers, AWS Lambda functions, and Amazon EventBridge buses. Finally, you’ll learn how to implement different networking and application caching features to improve response times of your applications using services like Amazon CloudFront and AWS Global Accelerator. When you’re finished with this course, you’ll have the skills and knowledge of AWS Solutions Architecture needed to pass exam objectives covering these different AWS services, as well as successfully implement them into real-world designs.',
  //         thumbnail_url: '',
  //         price: '100000',
  //         status: 'draft',
  //         created_at: '2026-02-01T07:43:21.334Z',
  //         enrollments: []
  //       },
  //       timestamp: '2024-10-01T12:34:56.789Z'
  //     }
  //   }
  // })
  // async create(@Body() createCourseDto: CreateCourseDto) {
  //   return ApiResponse.OkCreateResponse(await this.courseService.create(createCourseDto), 'Create Course successfully')
  // }

  // @Get()
  // @ApiOperation({ summary: 'Get all courses', description: 'Retrieve a list of all available courses with pagnition' })
  // @ApiBody({
  //   type: PaginationDto
  // })
  // @ApiSuccessResponse(CoursesListResponse)
  // async findAll(@Query('offset') offset: string, @Query('limit') limit: string) {
  //   return ApiResponse.OkResponse(await this.courseService.findAll(+offset, +limit), 'Get all courses successfully');
  // }

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

  // @Patch(':id')
  // @ApiOperation({ summary: 'Update meatadata of a course' })
  // @ApiBody({ type: UpdateCourseDto })
  // @ApiOkResponse({
  //   schema: {
  //     example: {
  //       success: true,
  //       code: 200,
  //       message: 'Presigned URL retrieved successfully.',
  //       data: {
  //         id: '6',
  //         owner_id: 'E.g: 1',
  //         title: 'AWS Certified Solutions Architect - Associate (SAA-C03): Scaling and Decoupling Architectures',
  //         short_description: '',
  //         long_description:
  //           'Becoming an AWS Solutions Architect requires that you have a deep understanding of the entire AWS ecosystem and an understanding of properly designing optimized, decoupled architectures. In this course, AWS Certified Solutions Architect - Associate (SAA-C03): Scaling and Decoupling Architectures, you’re going to learn to efficiently implement AWS services and best practices to achieve this. First, you’ll explore how to leverage Elastic Load Balancers to front Auto Scaling Groups for self-healing architectures, as well as implementing messaging queues via Amazon SQS. Next, you’ll discover how to leverage serverless options for event-driven designs, including Amazon ECS containers, AWS Lambda functions, and Amazon EventBridge buses. Finally, you’ll learn how to implement different networking and application caching features to improve response times of your applications using services like Amazon CloudFront and AWS Global Accelerator. When you’re finished with this course, you’ll have the skills and knowledge of AWS Solutions Architecture needed to pass exam objectives covering these different AWS services, as well as successfully implement them into real-world designs.',
  //         thumbnail_url: '',
  //         price: '100000',
  //         status: 'draft',
  //         created_at: '2026-02-01T07:43:21.334Z',
  //         enrollments: []
  //       },
  //       timestamp: '2024-10-01T12:34:56.789Z'
  //     }
  //   }
  // })
  // async update(@Param('id') id: string, @Body() updateCourseDto: UpdateCourseDto) {
  //   return ApiResponse.OkResponse(await this.courseService.update(+id, updateCourseDto), 'Update course successfully')
  // }

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
  remove(@Param('id') id: string) {
    return this.courseService.remove(+id)
  }
}
