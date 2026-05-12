import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { LabService } from './lab.service'
import { ApiResponse } from '../../utils/dto/ApiResponse'
import { GetConsoleUrlRequest } from './dto/get-console-url.dto'

@Controller('lab')
export class LabController {
  constructor(private readonly labService: LabService) {}

  @Get('me')
  async getLabHistory(
    @Query('userId') userId: string,
    @Query('leaseTemplateId') leaseTemplateId: string,
    @Query('pageSize') pageSize: number = 10
  ) {
    return ApiResponse.OkResponse(await this.labService.getLabHistory(userId, leaseTemplateId, pageSize))
  }

  @Post('console-url')
  @HttpCode(200)
  async getConsoleUrl(@Body() leaseData: GetConsoleUrlRequest) {
    const result = await this.labService.getConsoleUrl({
      leaseId: leaseData.leaseId,
      uuid: leaseData.uuid,
      awsAccountId: leaseData.awsAccountId,
      leaseDurationInHours: leaseData.leaseDurationInHours,
      expirationDate: leaseData.expirationDate,
      blueprintId: leaseData.blueprintId,
      originalLeaseTemplateUuid: leaseData.originalLeaseTemplateUuid
    })

    return ApiResponse.OkResponse(result)
  }

  @Get('lease/:leaseId')
  async getLeaseById(@Param('leaseId') leaseId: string) {
    return ApiResponse.OkResponse(await this.labService.getLeaseById(leaseId))
  }

  @Post('start')
  async startLab(@Body() leaseData: { labId: string; leaseTemplateUuid: string; userId: string }) {
    const result = await this.labService.startLab(leaseData)
    return ApiResponse.OkResponse(result)
  }

  @Post('leases/:leaseId/terminate')
  async terminateLab(@Param('leaseId') leaseId: string, @Body() body: { userId: string; labId: string }) {
    const result = await this.labService.terminateLab(leaseId, body)

    return ApiResponse.OkResponse(result)
  }
}
