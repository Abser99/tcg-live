import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.usersService.create(dto.email, dto.username, dto.password);

    // auto-promote to admin if email matches ADMIN_EMAIL env var
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    if (adminEmail && dto.email.toLowerCase() === adminEmail.toLowerCase()) {
      await this.usersService.updateRole(user.id, UserRole.ADMIN);
      user.role = UserRole.ADMIN;
    }

    const token = this.jwtService.sign({ sub: user.id });
    return { token, user: this.sanitize(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwtService.sign({ sub: user.id });
    return { token, user: this.sanitize(user) };
  }

  private sanitize(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash, ...safe } = user;
    return safe;
  }
}
