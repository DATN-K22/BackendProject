import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { UserRole, UserStatus } from '@prisma/client'

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
    } catch (error: any) {
      this.logger.error(`Failed to find user by id ${id}`, error.stack)
      throw new InternalServerErrorException('Failed to find user')
    }
  }

  async findByIds(ids: string[]) {
    try {
      const users = await this.prismaService.users.findMany({
        where: {
          id: {
            in: ids
          }
        },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          avt_url: true
        }
      })
      return users
    } catch (error: any) {
      this.logger.error(`Failed to find users by ids ${ids}`, error.stack)
      throw new InternalServerErrorException('Failed to find users')
    }
  }

  async updatePassword(user: { id: string }, newPassword: string) {
    try {
      await this.prismaService.users.update({ data: { password_hash: newPassword }, where: { id: user.id } })
    } catch (error: any) {
      this.logger.error(`Failed to update password for user ${user.id}`, error.stack)
      throw new InternalServerErrorException('Failed to update password')
    }
  }

  async updateUser(id: string, updateUserDto: any) {
    try {
      const user = await this.prismaService.users.update({ data: updateUserDto, where: { id } })
      return user
    } catch (error: any) {
      this.logger.error(`Failed to update user ${id}`, error.stack)
      throw new InternalServerErrorException('Failed to update user')
    }
  }

  async findByEmail(email: string) {
    try {
      return await this.prismaService.users.findUnique({
        where: { email }
      })
    } catch (error: any) {
      this.logger.error(`Failed to find user by email ${email}`, error.stack)
      throw new InternalServerErrorException('Failed to find user')
    }
  }

  async createUser(data: {
    email: string
    password_hash: string
    first_name?: string
    last_name?: string
    role?: UserRole
    status: UserStatus
  }) {
    try {
      return await this.prismaService.users.create({ data })
    } catch (error: any) {
      this.logger.error(`Failed to create user ${data.email}`, error.stack)
      throw error
    }
  }

  async updateStatusByEmail(email: string, status: UserStatus) {
    try {
      return await this.prismaService.users.update({
        where: { email },
        data: { status }
      })
    } catch (error: any) {
      this.logger.error(`Failed to update status for ${email}`, error.stack)
      throw new InternalServerErrorException('Failed to update status')
    }
  }

  async updatePasswordByEmail(email: string, password_hash: string) {
    try {
      return await this.prismaService.users.update({
        where: { email },
        data: { password_hash }
      })
    } catch (error: any) {
      this.logger.error(`Failed to update password for ${email}`, error.stack)
      throw new InternalServerErrorException('Failed to update password')
    }
  }
}
