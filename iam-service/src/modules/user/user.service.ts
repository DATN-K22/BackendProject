import { Injectable, Logger } from '@nestjs/common'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserRespository } from './user.repository'
import { PrismaService } from '../../prisma/prisma.service'
import { ApiBearerAuth } from '@nestjs/swagger'

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name)

  constructor(private readonly userRepository: UserRespository) {}

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

  create(createUserDto: CreateUserDto) {
    return 'This action adds a new user'
  }

  findAll() {
    return `This action returns all user`
  }

  findOne(id: number) {
    return `This action returns a #${id} user`
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`
  }

  remove(id: number) {
    return `This action removes a #${id} user`
  }
}
