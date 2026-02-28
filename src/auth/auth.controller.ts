import { Controller, Post, Body, ValidationPipe } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthCredentialsDto } from './dto/auth-credentials.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body(ValidationPipe) dto: AuthCredentialsDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body(ValidationPipe) dto: AuthCredentialsDto) {
    return this.authService.login(dto);
  }
}
