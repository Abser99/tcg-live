import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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
import { AuctionGame } from '../entities/auction.entity';

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

  @IsInt()
  @Min(1)
  @IsOptional()
  binPrice?: number; // Buy It Now price in MXN cents

  @IsString()
  @IsOptional()
  gradingCompany?: string; // PSA, BGS, CGC

  @IsString()
  @IsOptional()
  grade?: string; // e.g. "9", "9.5", "10"

  @IsBoolean()
  @IsOptional()
  autoRelist?: boolean;
}

export class CreateAuctionDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(AuctionGame)
  @IsOptional()
  game?: AuctionGame;

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
