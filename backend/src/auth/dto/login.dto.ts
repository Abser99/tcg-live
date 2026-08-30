import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  /** Keep the session for 30 days instead of the default. */
  @IsBoolean()
  @IsOptional()
  rememberMe?: boolean;
}
