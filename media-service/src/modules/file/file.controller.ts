import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { FileService } from './file.service';
import { ApiResponse } from 'src/utils/dto/ApiResponse';
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiResponse as SwaggerApiResponse } from '@nestjs/swagger';
import { CreateFileDto } from './dto/request/create-file.dto';
import { UpdateFileDto } from './dto/request/update-file.dto';
import { ApiSuccessResponse } from 'src/utils/helper/api-success-response.decorator';
import { CreateFileResponse } from './dto/response/create-file.response';

@Controller('file')
@ApiTags('File Management APIs')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post()
  @ApiOperation({ summary: 'Save a file record after fe uploading to S3 and get public URL'})
  @ApiBody({ type: CreateFileDto })
  @ApiSuccessResponse(CreateFileResponse)
  async create(@Body() createFileDto: CreateFileDto) {
    return ApiResponse.OkCreateResponse("Save record successfully", await this.fileService.create(createFileDto));
  }

  @Get()
  findAll() {
    return this.fileService.findAll();
  }

  @Get('presigned-url/:key')
  @ApiOperation({summary: 'Get Presigned URL for uploading file'})
  @ApiParam({name: 'key', description: 'The filename for the file in the cloud storage. Eg: test.jpeg'})
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
  async getPresignedUrl(@Param('key') key: string) {
    const url = await this.fileService.getPresignedUrl(key);
    return ApiResponse.OkResponse('Presigned URL retrieved successfully.', url);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.fileService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFileDto: UpdateFileDto) {
    return this.fileService.update(+id, updateFileDto);
  }

  @Delete(':id')
  @ApiOperation({summary: "Delete file in both database and cloud storage"})
  @ApiParam({name: 'id', description: 'id of file saved in database'})
  @ApiSuccessResponse(ApiResponse<string>)
  remove(@Param('id') id: string) {
    return this.fileService.remove(+id);
  }
}
