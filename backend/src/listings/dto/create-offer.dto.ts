import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateOfferDto {
  @IsInt()
  @Min(1)
  amount: number; // MXN cents

  @IsString()
  @IsOptional()
  message?: string;
}
