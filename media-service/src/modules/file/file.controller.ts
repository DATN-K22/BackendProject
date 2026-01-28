import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { FileService } from './file.service';
import { CreateFileDto } from './dto/create-file.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import { ApiResponse } from 'src/utils/dto/ApiResponse';
import { ApiResponse as SwaggerApiResponse } from '@nestjs/swagger';

@Controller('file')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post()
  create(@Body() createFileDto: CreateFileDto) {
    return this.fileService.create(createFileDto);
  }

  @Get()
  findAll() {
    return this.fileService.findAll();
  }

  @Get('presigned-url/:key')
  @SwaggerApiResponse({
    status: 200,
    description: 'Presigned URL retrieved successfully.',
  })
  async getPresignedUrl(@Param('key') key: string) {
    const url = await this.fileService.getPresignedUrl(key);
    const response: ApiResponse<string> = {
      success: true,
      code: 200,
      message: 'Presigned URL retrieved successfully.',
      data: url,
      timestamp: new Date().toISOString(),
    };
    return response;
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
  remove(@Param('id') id: string) {
    return this.fileService.remove(+id);
  }


}
