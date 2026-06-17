import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, IsUUID } from 'class-validator'

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ example: 'John', required: false })
  first_name?: string

  @IsOptional()
  @IsString()
  @ApiProperty({ example: 'Doe', required: false })
  last_name?: string
}

export class UpdateUserPasswordDto {
  @ApiProperty({ example: 'new_password123' })
  @IsString()
  new_password!: string

  @ApiProperty({ example: 'current_password123' })
  @IsString()
  current_password!: string
}
