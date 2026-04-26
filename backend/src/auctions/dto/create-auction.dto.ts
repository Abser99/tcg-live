import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';
import { CardCondition } from '../entities/auction-item.entity';

export class CreateAuctionItemDto {
  @IsString()
  @IsNotEmpty()
  cardName: string;

  @IsString()
  @IsOptional()
  cardSet?: string;

  @IsString()
  @IsOptional()
  cardNumber?: string;

  @IsEnum(CardCondition)
  @IsOptional()
  condition?: CardCondition;

  @IsInt()
  @Min(1)
  startingPrice: number; // MXN cents

  @IsInt()
  @Min(1)
  @IsOptional()
  reservePrice?: number;

  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  imageUrls?: string[];
}

export class CreateAuctionDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAuctionItemDto)
  @IsOptional()
  items?: CreateAuctionItemDto[];
}
