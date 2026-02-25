import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Request } from '@nestjs/common'
import { CourseService } from './course.service'
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResponse } from '../../utils/dto/ApiResponse'
import { CreateCourseDto } from './dto/request/create-course.dto'
import { UpdateCourseDto } from './dto/request/update-course.dto'
import { PaginationDto } from '../../utils/dto/PagnitionDto'
import { ApiSuccessResponse } from '../../utils/helper/api-success-response.decorator'
import { CoursesListResponse } from './dto/response/CourseslListResponse'

@Controller('courses')
@ApiTags('Course Management APIsl')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Post()
  @ApiOperation({ summary: 'Save a meatadata of a course' })
  @ApiBody({ type: CreateCourseDto })
  @ApiOkResponse({
    schema: {
      example: {
        success: true,
        code: 200,
        message: 'Presigned URL retrieved successfully.',
        data: {
          id: '6',
          owner_id: 'E.g: 1',
          title: 'AWS Certified Solutions Architect - Associate (SAA-C03): Scaling and Decoupling Architectures',
          short_description: '',
          long_description:
            'Becoming an AWS Solutions Architect requires that you have a deep understanding of the entire AWS ecosystem and an understanding of properly designing optimized, decoupled architectures. In this course, AWS Certified Solutions Architect - Associate (SAA-C03): Scaling and Decoupling Architectures, you’re going to learn to efficiently implement AWS services and best practices to achieve this. First, you’ll explore how to leverage Elastic Load Balancers to front Auto Scaling Groups for self-healing architectures, as well as implementing messaging queues via Amazon SQS. Next, you’ll discover how to leverage serverless options for event-driven designs, including Amazon ECS containers, AWS Lambda functions, and Amazon EventBridge buses. Finally, you’ll learn how to implement different networking and application caching features to improve response times of your applications using services like Amazon CloudFront and AWS Global Accelerator. When you’re finished with this course, you’ll have the skills and knowledge of AWS Solutions Architecture needed to pass exam objectives covering these different AWS services, as well as successfully implement them into real-world designs.',
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
  findOne(@Param('id') id: string) {
    return this.courseService.findOne(+id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update meatadata of a course' })
  @ApiBody({ type: UpdateCourseDto })
  @ApiOkResponse({
    schema: {
      example: {
        success: true,
        code: 200,
        message: 'Presigned URL retrieved successfully.',
        data: {
          id: '6',
          owner_id: 'E.g: 1',
          title: 'AWS Certified Solutions Architect - Associate (SAA-C03): Scaling and Decoupling Architectures',
          short_description: '',
          long_description:
            'Becoming an AWS Solutions Architect requires that you have a deep understanding of the entire AWS ecosystem and an understanding of properly designing optimized, decoupled architectures. In this course, AWS Certified Solutions Architect - Associate (SAA-C03): Scaling and Decoupling Architectures, you’re going to learn to efficiently implement AWS services and best practices to achieve this. First, you’ll explore how to leverage Elastic Load Balancers to front Auto Scaling Groups for self-healing architectures, as well as implementing messaging queues via Amazon SQS. Next, you’ll discover how to leverage serverless options for event-driven designs, including Amazon ECS containers, AWS Lambda functions, and Amazon EventBridge buses. Finally, you’ll learn how to implement different networking and application caching features to improve response times of your applications using services like Amazon CloudFront and AWS Global Accelerator. When you’re finished with this course, you’ll have the skills and knowledge of AWS Solutions Architecture needed to pass exam objectives covering these different AWS services, as well as successfully implement them into real-world designs.',
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

  @Get('/user/:id/courses/incomplete/latest')
  async getLatestIncompleteCourseForUser(@Param('id') userId: string) {
    return ApiResponse.OkResponse(
      await this.courseService.getLatestIncompleteCourseForUser(userId),
      'Get latest incomplete course for user successfully'
    )
  }

  // @Get('/top-rating')
  // async getTopRatingCourses() {
  //   return ApiResponse.OkResponse(
  //     await this.courseService.getTopRatingCourse(0, 5),
  //     'Get top rating courses successfully'
  //   )
  // }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.courseService.remove(+id)
  }
}
