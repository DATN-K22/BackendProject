import { ForbiddenException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import * as argon from 'argon2'
import { AuthSignInDto, AuthSignUpDto } from './dto/auth.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';


@Injectable()
export class AuthService {
    constructor(private readonly prisma: PrismaService,
                private readonly jwtService: JwtService
    ) { }

    async signin(authDto: AuthSignInDto): Promise<{ access_token: string , refresh_token: string }> {
        // Find user in database
        const user = await this.prisma.user.findUnique({
            where: {
                email: authDto.email
            }
        })
        if (!user) {
            throw new ForbiddenException('Credentials incorrect')
        }
        // Verify password
        const passMatch = await argon.verify(
            user.password_hash,
            authDto.password_hash
        )
        console.log("Password match:", passMatch);
        if (!passMatch) {
            throw new ForbiddenException("Credentials incorrect")
        }

        console.log("User signed in:", user.email);

        const payload = { sub: user.id, email: user.email }
        const access_token = await this.jwtService.signAsync(
            payload,
            { expiresIn: '15m' }
        )
        const refresh_token = await this.jwtService.signAsync(
            payload, 
            { expiresIn: '2h' }
        )
        return {
            access_token,
            refresh_token
        }
    }

    async signup(authDto: AuthSignUpDto) {
        const hash = await argon.hash(authDto.password_hash)

        try {
            const user = await this.prisma.user.create({
                data: {
                    first_name: authDto.first_name,
                    last_name: authDto.last_name,
                    role: authDto.role,
                    email: authDto.email,
                    password_hash: hash,
                }
            })
            return user
        } catch (error) {
            console.log(error)
            if (error instanceof PrismaClientKnownRequestError) {
                if (error.code == 'P2002')
                    throw new ForbiddenException('Email has been used')
            }
            throw new Error("Error occured! Please try again");
        }

    }

    async refreshToken(refreshToken: string) {
        try {
            const oldPayload = await this.jwtService.verifyAsync(refreshToken, {
                secret: process.env.JWT_SECRET_KEY,
            })
            
            const {iat, exp, ...payload} = oldPayload
            if (!payload) {
                throw new UnauthorizedException("Invalid refresh token");
            }

            const access_token = await this.jwtService.signAsync(
                payload,
                { expiresIn: '15m' }
            );
            const newRefreshToken = await this.jwtService.signAsync(
                payload, 
                { expiresIn: '1h' }
            );
            
            return {
                access_token,
                refresh_token: newRefreshToken
            };
        } catch (error) {
            console.log(error)
            if (error instanceof TokenExpiredError) {
                throw new UnauthorizedException({statusCode: 1001, message: 'Refresh token expired', error: error}); 
            } else {
                throw new InternalServerErrorException("An unexpected error occurred during refresh token");
            }
        }
    }
} 
    