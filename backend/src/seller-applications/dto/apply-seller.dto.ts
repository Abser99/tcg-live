import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ApplySellerDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @MinLength(20)
  @MaxLength(500)
  description: string;
}
