import { Injectable, Logger } from '@nestjs/common'
import { UserRespository } from './user.repository'
import { UpdateUserDto } from './dto/update-user.dto'

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
}
