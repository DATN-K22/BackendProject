import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { UserRespository } from './user.repository'
import { PrismaService } from '../../prisma/prisma.service'
import { ApiBearerAuth } from '@nestjs/swagger'
import { first } from 'rxjs'
import { UpdateUserDto, UpdateUserPasswordDto } from './dto/update-user.dto'
import { AuthService } from '../auth/auth.service'

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name)

  constructor(
    private readonly userRepository: UserRespository,
    private readonly authService: AuthService
  ) {}

  async findByIds(users_ids: string[]) {
    const users = await this.userRepository.findByIds(users_ids)
    const response = users.map((user) => {
      return {
        id: user.id,
        name: user.first_name + ' ' + user.last_name,
        avt_url: user.avt_url
      }
    })
    return response
  }

  async findOne(id: string) {
    const user = await this.userRepository.findById(id)
    if (!user) {
      throw new Error('User not found')
    }
    return user
  }

  update(id: string, updateUserDto: UpdateUserDto) {
    return this.userRepository.updateUser(id, updateUserDto)
  }

  remove(id: string) {
    return `This action removes a #${id} user`
  }

  async updatePassword(id: string, updatePassword: UpdateUserPasswordDto) {
    const user = await this.userRepository.findById(id.toString())
    if (!user) {
      throw new NotFoundException('User not found')
    }
    // Check if current password is correct
    const isPasswordValid = await this.authService.passwordMatches(user, updatePassword.current_password)
    if (!isPasswordValid) {
      throw new ForbiddenException('Current password is incorrect')
    }
    await this.userRepository.updatePassword(user, await this.authService.hashPassword(updatePassword.new_password))
  }
}
