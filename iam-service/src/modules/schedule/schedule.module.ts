import { Module } from '@nestjs/common';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ScheduleTool } from './schedule.tool';
import { McpModule } from '@rekog/mcp-nest';

@Module({
  imports: [McpModule.forFeature([ScheduleTool], 'schedule-mcp')],
  controllers: [ScheduleController],
  providers: [PrismaService, ScheduleService, ScheduleTool],
  exports: [ScheduleTool]
})
export class ScheduleModule {}
