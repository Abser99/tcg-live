import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateListingDto {
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() description?: string;
  @IsNumber() @Min(100) @IsOptional() price?: number;
  @IsInt() @Min(0) @Max(95) @IsOptional() discountPercent?: number;
  @IsBoolean() @IsOptional() promoted?: boolean;
  @IsString() @IsOptional() game?: string;
  @IsString() @IsOptional() condition?: string;
  @IsArray() @IsString({ each: true }) @IsOptional() imageUrls?: string[];
}
