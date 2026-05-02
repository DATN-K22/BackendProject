import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsString } from 'class-validator'

export class OTPVerificationDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string

  @ApiProperty({ example: '123456' })
  @IsString()
  otp!: string
}

export class OTPDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string

  @ApiProperty({ example: '123456' })
  @IsString()
  otp!: string

  @ApiProperty({ example: 'newPassword123' })
  @IsString()
  newPassword!: string
}
