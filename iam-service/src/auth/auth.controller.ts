import { Body, Controller, Get, Post, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthSignInDto, AuthSignUpDto } from './dto/auth.dto';
import { AuthGuard } from './auth.guard';
 
@Controller('auth')
@UsePipes(new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
}))

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signin')
  signin(@Body() authDto : AuthSignInDto) {
    return this.authService.signin(authDto)
  }

  @Post('signup')
  signup(@Body() authDto : AuthSignUpDto) {
    return this.authService.signup(authDto)
  }
  
  @Post('refreshToken')
  refreshToken(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken)
  }

}