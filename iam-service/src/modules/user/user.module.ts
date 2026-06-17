import { Module } from '@nestjs/common'
import { UserService } from './user.service'
import { UserController } from './user.controller'
import { UserRespository } from './user.repository'
import { AuthModule } from '../auth/auth.module'

@Module({
  controllers: [UserController],
  providers: [UserService, UserRespository],
  exports: [UserRespository]
})
export class UserModule {}
