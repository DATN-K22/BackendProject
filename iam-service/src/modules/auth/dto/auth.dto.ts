import { IsEnum } from '@nestjs/class-validator'
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class AuthSignUpDto {
  @IsEmail()
  email: string

  @IsString()
  @IsNotEmpty()
  password: string

  @IsOptional()
  @IsString()
  first_name?: string

  @IsOptional()
  @IsString()
  last_name?: string

  @IsOptional()
  @IsString()
  @IsEnum(['user', 'admin'])
  role?: 'user' | 'admin'
}

export class AuthSignInDto {
  @IsEmail()
  email: string

  @IsString()
  @IsNotEmpty()
  password: string
}
