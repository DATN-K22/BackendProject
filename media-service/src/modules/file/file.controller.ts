import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { FileService } from './file.service';
import { ApiResponse } from 'src/utils/dto/ApiResponse';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiResponse as SwaggerApiResponse
} from '@nestjs/swagger';
import { CreateFileDto } from './dto/request/create-file.dto';
import { UpdateFileDto } from './dto/request/update-file.dto';
import { ApiSuccessResponse } from 'src/utils/helper/api-success-response.decorator';
import { CreateFileResponse } from './dto/response/create-file.response';

@Controller('files')
@ApiTags('File Management APIs')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post()
  @ApiOperation({ summary: 'Save a file record after fe uploading to S3' })
  @ApiBody({ type: CreateFileDto })
  @ApiSuccessResponse(CreateFileResponse)
  async create(@Body() createFileDto: CreateFileDto) {
    return ApiResponse.OkCreateResponse(await this.fileService.create(createFileDto), 'Save record successfully');
  }

  @Get('presigned-url/:course_id/:chapter_item_id/:filename')
  @Get('presigned-url/:course_id/:lesson_id/:filename')
  @ApiOperation({ summary: 'Get Presigned URL for uploading file for video and image resources of a chapter item' })
  @ApiParam({ name: 'filename', description: 'The filename for the file in the cloud storage. Eg: test.jpeg' })
  @ApiParam({ name: 'course_id', description: 'The ID of the course to which the file belongs' })
  @ApiParam({ name: 'chapter_item_id', description: 'The ID of the chapter item to which the file belongs' })
  @ApiOkResponse({
    schema: {
      example: {
        success: true,
        code: 200,
        message: 'Presigned URL retrieved successfully.',
        data: 'https://example-bucket.s3.amazonaws.com/your-file-key?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...',
        timestamp: '2024-10-01T12:34:56.789Z'
      }
    }
  })
  async getPresignedUrlForS3Uploading(
    @Param('filename') filename: string,
    @Param('course_id') courseId: string,
    @Param('chapter_item_id') chapterItemId: string,
    @Param('lesson_id') lessonId: string
  ) {
    const url = await this.fileService.getPresignedUrlForS3Uploading(filename, courseId, chapterItemId ?? lessonId);
    return ApiResponse.OkResponse(url, 'Presigned URL retrieved successfully.');
  }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.fileService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateFileDto: UpdateFileDto) {
  //   return this.fileService.update(+id, updateFileDto);
  // }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete file in both database and cloud storage' })
  @ApiParam({ name: 'id', description: 'id of file saved in database' })
  @ApiSuccessResponse(ApiResponse<string>)
  remove(@Param('id') id: string) {
    return this.fileService.remove(+id);
  }

  @Get('/chapter-item/:id')
  async findResourcesByChapterItemId(@Param('id') chapterItemId: string) {
    return ApiResponse.OkResponse(await this.fileService.findResourcesByChapterItemId(chapterItemId));
  }

  @Get('/lesson/:id')
  async findResourcesByLessonId(@Param('id') lessonId: string) {
    return ApiResponse.OkResponse(await this.fileService.findResourcesByLessonId(lessonId));
  }
}
