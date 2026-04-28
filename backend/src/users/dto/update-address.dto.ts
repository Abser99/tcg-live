import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{5}$/, { message: 'Código postal inválido' })
  zipCode?: string;

  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  colonia?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;
}
