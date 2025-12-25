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
    role: string
}

export class AuthSignInDto {
    @IsString()
    email: string

    @IsString()
    password_hash: string
}

