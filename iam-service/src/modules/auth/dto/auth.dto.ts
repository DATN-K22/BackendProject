import { IsEnum } from '@nestjs/class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class AuthSignUpDto {
  @IsEmail()
  @ApiProperty({example: "example@gmail.com"})
  email: string

  @IsString()
  @IsNotEmpty()
  @ApiProperty({example: "abc@123"})
  password: string

  @IsOptional()
  @IsString()
  @ApiProperty({example: "testing"})
  first_name?: string

  @IsOptional()
  @IsString()
  @ApiProperty({example: "user"})
  last_name?: string

  @IsOptional()
  @IsString()
  @IsEnum(['user', 'admin'])
  role?: 'user' | 'admin'
}

export class AuthSignInDto {
  @IsEmail()
  @ApiProperty({example: "example@gmail.com"})
  email: string

  @IsString()
  @IsNotEmpty()
  @ApiProperty({example: "abc@123"})
  password: string
}
