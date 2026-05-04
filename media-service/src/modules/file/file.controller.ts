import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { FileService } from './file.service';
import {
  CompleteVideoUploadDto,
  CreateFilesDto,
  GetPartPresignedUrlDto,
  GetPresignedUrlsDto,
  InitVideoUploadDto
} from './dto/request/create-file.dto';
import { ApiSuccessResponse } from '../../utils/helper/api-success-response.decorator';
import { ApiResponse } from '../../utils/dto/ApiResponse';

@Controller('files')
@ApiTags('File Management APIs')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  // ── Documents / Images ─────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Save multiple document/image records after uploading to S3' })
  @ApiBody({ type: CreateFilesDto })
  async createMany(@Body() createFilesDto: CreateFilesDto) {
    return ApiResponse.OkCreateResponse(await this.fileService.createMany(createFilesDto), 'Save records successfully');
  }

  @Post('presigned-urls')
  @ApiOperation({ summary: 'Get presigned PUT URLs for documents/images (single PUT, no video)' })
  @ApiBody({ type: GetPresignedUrlsDto })
  async getPresignedUrls(@Body() dto: GetPresignedUrlsDto) {
    return ApiResponse.OkResponse(await this.fileService.generatePresignedUrls(dto));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete file from both database and S3' })
  @ApiParam({ name: 'id', description: 'Database ID of the file' })
  @ApiSuccessResponse(ApiResponse<string>)
  remove(@Param('id') id: string) {
    return this.fileService.remove(+id);
  }

  @Get('/chapter-item/:id')
  @ApiOperation({ summary: 'Get all resources by chapter item ID' })
  async findResourcesByChapterItemId(@Param('id') chapterItemId: string) {
    return ApiResponse.OkResponse(await this.fileService.findResourcesByChapterItemId(chapterItemId));
  }

  @Get('/lesson/:id')
  @ApiOperation({ summary: 'Get all resources by lesson ID' })
  async findResourcesByLessonId(@Param('id') lessonId: string) {
    return ApiResponse.OkResponse(await this.fileService.findResourcesByLessonId(lessonId));
  }

  // ── Video Multipart Upload ─────────────────────────────────────────────────

  @Post('video/init')
  @ApiOperation({ summary: 'Init S3 multipart upload session for video — returns uploadId + totalParts' })
  @ApiBody({ type: InitVideoUploadDto })
  async initVideoUpload(@Body() dto: InitVideoUploadDto) {
    return ApiResponse.OkCreateResponse(await this.fileService.initVideoUpload(dto), 'Upload session created');
  }

  @Post('video/:uploadId/presigned-url')
  @ApiOperation({ summary: 'Get presigned URL for a single part (call on-demand per part)' })
  @ApiParam({ name: 'uploadId', description: 'S3 multipart UploadId' })
  @ApiBody({ type: GetPartPresignedUrlDto })
  async getPartPresignedUrl(@Param('uploadId') uploadId: string, @Body() dto: GetPartPresignedUrlDto) {
    return ApiResponse.OkResponse(await this.fileService.getPartPresignedUrl(uploadId, dto.partNumber));
  }

  @Get('video/:uploadId/parts')
  @ApiOperation({ summary: 'List uploaded parts from S3 — use missingParts[] to resume' })
  @ApiParam({ name: 'uploadId', description: 'S3 multipart UploadId' })
  async listParts(@Param('uploadId') uploadId: string) {
    return ApiResponse.OkResponse(await this.fileService.listUploadedParts(uploadId));
  }

  @Post('video/:uploadId/complete')
  @ApiOperation({ summary: 'Complete multipart upload → triggers S3 event → Lambda for HLS conversion' })
  @ApiParam({ name: 'uploadId', description: 'S3 multipart UploadId' })
  @ApiBody({ type: CompleteVideoUploadDto })
  async completeVideoUpload(@Param('uploadId') uploadId: string, @Body() dto: CompleteVideoUploadDto) {
    return ApiResponse.OkResponse(await this.fileService.completeVideoUpload(uploadId, dto));
  }
}
