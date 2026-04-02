import { Controller, Get, Post, Body, Patch, Param, Delete, Request, UseGuards } from '@nestjs/common'
import { UserService } from './user.service'
import { ApiResponse } from '../../utils/dto/ApiResponse'
import { UpdateUserDto, UpdateUserPasswordDto } from './dto/update-user.dto'

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('find-by-ids')
  async findByIds(@Body('user_ids') user_ids: string[]): Promise<any[]> {
    return this.userService.findByIds(user_ids)
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return ApiResponse.OkResponse(await this.userService.findOne(id))
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return ApiResponse.OkResponse(await this.userService.update(id, updateUserDto), 'User updated successfully')
  }

  @Patch(':id/password')
  async updatePassword(@Param('id') id: string, @Body() updatePassword: UpdateUserPasswordDto) {
    return ApiResponse.OkResponse(
      await this.userService.updatePassword(id, updatePassword),
      'Password updated successfully'
    )
  }
}
