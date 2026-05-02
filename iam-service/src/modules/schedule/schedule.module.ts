import { Module } from '@nestjs/common'
import { ScheduleController } from './schedule.controller'
import { ScheduleService } from './schedule.service'
import { PrismaService } from '../../prisma/prisma.service'
import { ScheduleRepository } from './schedule.repository'
import { ScheduleTool } from './schedule.tool'
import { McpModule } from '@rekog/mcp-nest'

@Module({
  imports: [McpModule.forFeature([ScheduleTool], 'schedule-mcp')],
  controllers: [ScheduleController],
  providers: [PrismaService, ScheduleRepository, ScheduleService, ScheduleTool],
  exports: [ScheduleTool]
})
export class ScheduleModule {}
