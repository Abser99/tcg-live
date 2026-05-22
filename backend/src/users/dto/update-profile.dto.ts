import { IsOptional, IsString, Length, Matches, IsUrl } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 30)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username solo puede contener letras, números y guiones bajos' })
  username?: string;

  @IsOptional()
  @IsString()
  @Length(2, 60)
  displayName?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}
