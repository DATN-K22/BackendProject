import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class UserRespository {
  constructor(private readonly prismaService: PrismaService) {}

  private readonly logger = new Logger(UserRespository.name)
}
