import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class UserRespository {
  constructor(private readonly prismaService: PrismaService) {}

  private readonly logger = new Logger(UserRespository.name)

  async findById(id: string) {
    try {
      const user = await this.prismaService.users.findUnique({
        where: { id }
      })
      return user
    } catch (error) {
      this.logger.error(`Failed to find user by id ${id}`, error.stack)
      throw new InternalServerErrorException('Failed to find user')
    }
  }
}
