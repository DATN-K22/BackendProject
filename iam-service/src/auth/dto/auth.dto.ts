import { UserRole } from '@prisma/client';
import { IsString } from 'class-validator';

export class AuthSignUpDto {
    @IsString()
    first_name: string

    @IsString()
    last_name: string

    @IsString()
    email: string

    @IsString()
    password_hash: string

    @IsString()
    role: UserRole
}

export class AuthSignInDto {
    @IsString()
    email: string

    @IsString()
    password_hash: string
}

