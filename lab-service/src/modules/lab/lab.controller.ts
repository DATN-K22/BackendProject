import { Controller, Get, Param, Query, Headers, Post } from '@nestjs/common';
import { LabService } from './lab.service';
import { ApiResponse } from '../utils/dto/ApiResponse';

@Controller('labs')
export class LabController {
  constructor(private readonly labService: LabService) {}

  @Get('/:lessonId/lab')
  async getLabDetail(
    @Param('lessonId') lessonId: string,
    @Query('mode') mode: string = 'tutorial',
  ) {
    return ApiResponse.OkResponse(
      await this.labService.getLabDetail(lessonId, mode),
    );
  }

  @Get('/start/:lessonId')
  async startLab(
    @Param('lessonId') lessonId: string,
    @Query('mode') mode: string = 'tutorial',
    @Headers('x-user-id') userId: string,
  ) {
    return ApiResponse.OkResponse(
      await this.labService.startLab(lessonId, mode, userId),
    );
  }
}
