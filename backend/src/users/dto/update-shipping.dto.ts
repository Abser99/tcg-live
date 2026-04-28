import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateShippingDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  shippingNote?: string;

  @IsOptional()
  @IsBoolean()
  shippingInsurance?: boolean;
}
