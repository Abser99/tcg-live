import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateListingDto {
  @IsString() @IsNotEmpty() title: string;
  @IsString() @IsOptional() description?: string;
  @IsNumber() @Min(100) price: number; // MXN cents, min $1
  @IsString() @IsOptional() game?: string;
  @IsString() @IsOptional() condition?: string;
  @IsArray() @IsString({ each: true }) @IsOptional() imageUrls?: string[];
}
