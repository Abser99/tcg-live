import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const RESET_TTL_SECONDS = 3_600; // 1 hour

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly redis: Redis;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    // Support both REDIS_URL (Railway / Heroku) and individual REDIS_HOST/PORT vars
    const redisUrl = process.env.REDIS_URL;
    this.redis = redisUrl
      ? new Redis(redisUrl, { lazyConnect: true })
      : new Redis({
          host: process.env.REDIS_HOST ?? 'localhost',
          port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
          lazyConnect: true,
        });
  }

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

    if (user.isSuspended) {
      throw new UnauthorizedException('Tu cuenta ha sido suspendida. Contacta a soporte en tcgsubastas@gmail.com');
    }

    const token = this.jwtService.sign({ sub: user.id });
    return { token, user: this.sanitize(user) };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) return; // silently succeed — don't leak whether email exists

    const token = crypto.randomBytes(32).toString('hex');
    await this.redis.set(`reset:${token}`, user.id, 'EX', RESET_TTL_SECONDS);

    const webUrl = this.configService.get<string>('WEB_URL') ?? 'http://localhost:3001';
    const resetUrl = `${webUrl}/reset-contrasena?token=${token}`;

    await this.sendResetEmail(user.email, resetUrl);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const userId = await this.redis.get(`reset:${dto.token}`);
    if (!userId) throw new BadRequestException('El enlace de recuperación expiró o no es válido');

    const user = await this.usersService.findById(userId);
    if (!user) throw new BadRequestException('Usuario no encontrado');

    const hash = await bcrypt.hash(dto.newPassword, 12);
    await this.usersService.setPasswordHash(user.id, hash);
    await this.redis.del(`reset:${dto.token}`);
  }

  private async sendResetEmail(to: string, resetUrl: string): Promise<void> {
    const smtpHost = process.env.SMTP_HOST;

    if (!smtpHost) {
      // No SMTP configured — log the link so it's accessible in Railway logs
      this.logger.log(`[PASSWORD RESET] ${to} → ${resetUrl}`);
      return;
    }

    try {
      // Dynamic import so the app starts even if nodemailer isn't installed yet
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.SMTP_PORT ?? '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? 'TCG Live <tcgsubastas@gmail.com>',
        to,
        subject: 'Recuperación de contraseña — TCG Live',
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;background:#16161E;color:#fff;border-radius:16px">
            <h2 style="color:#a78bfa;margin-bottom:8px">Recuperar contraseña</h2>
            <p style="color:#a1a1aa;margin-bottom:24px">Recibimos una solicitud para restablecer tu contraseña en TCG Live.</p>
            <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#6C3AE8,#8B5CF6);color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:900">
              Restablecer contraseña →
            </a>
            <p style="color:#71717a;font-size:12px;margin-top:24px">Este enlace expira en 1 hora. Si no solicitaste esto, ignora este correo.</p>
          </div>`,
      });
    } catch (err) {
      this.logger.error(`Failed to send reset email to ${to}:`, err);
      // Don't throw — the token is still valid, user can check logs
    }
  }

  private sanitize(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash, ...safe } = user;
    return safe;
  }
}
