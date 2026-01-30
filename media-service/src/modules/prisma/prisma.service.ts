import { PrismaClient } from "generated/prisma/client";
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);
  constructor() {
    super({
      log: ['warn', 'error'],
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected successfully.');
    } catch (error) {
      console.error('Error connecting to the database:', error);
      throw error;
    }
    
  }
}
