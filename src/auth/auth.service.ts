import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthCredentialsDto } from './dto/auth-credentials.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: AuthCredentialsDto) {
    const { email, password } = dto;

    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(password, salt);

    try {
      const user = await this.prisma.user.create({
        data: { email, password: hashedPassword },
      });
      return { message: 'User berhasil dibuat', userId: user.id };
    } catch (error) {
      if (error.code === 'P2002')
        throw new ConflictException('Email sudah ada');
      throw error;
    }
  }

  async login(dto: AuthCredentialsDto): Promise<{ accessToken: string }> {
    const { email, password } = dto;
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user && (await bcrypt.compare(password, user.password))) {
      const payload = { sub: user.id, email: user.email };
      const accessToken = this.jwtService.sign(payload);
      return { accessToken };
    }

    throw new UnauthorizedException('Email atau password salah');
  }
}
