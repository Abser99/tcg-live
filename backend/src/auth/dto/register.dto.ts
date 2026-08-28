import { IsEmail, IsString, MinLength, MaxLength, Matches, IsBoolean, Equals, IsDateString, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers, and underscores' })
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  /** Age gate: the user must confirm they are 18 or older to register. */
  @IsBoolean()
  @Equals(true, { message: 'You must confirm that you are 18 years or older.' })
  over18: boolean;

  /** ISO date (YYYY-MM-DD). The server does the maths — see AuthService.register. */
  @IsDateString({}, { message: 'La fecha de nacimiento no es válida' })
  @IsOptional()
  birthDate?: string;

  @IsBoolean({ message: 'Debes aceptar los términos y condiciones' })
  @IsOptional()
  acceptedTerms?: boolean;
}
