import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';
import { AuctionGame } from '../entities/auction.entity';

export class CreateAuctionItemDto {
  @IsString({ message: 'El nombre del producto debe ser texto' })
  @IsNotEmpty({ message: 'El nombre del producto es requerido' })
  cardName: string;

  @IsString({ message: 'El set debe ser texto' })
  @IsOptional()
  cardSet?: string;

  @IsString({ message: 'El número de carta debe ser texto' })
  @IsOptional()
  cardNumber?: string;

  @IsString({ message: 'La condición debe ser texto (ej. NM, LP, PSA 10)' })
  @IsOptional()
  condition?: string;

  @IsInt({ message: 'El precio inicial debe ser un número entero (en centavos MXN)' })
  @Min(1, { message: 'El precio inicial debe ser mayor a $0' })
  startingPrice: number;

  @IsInt({ message: 'El precio de reserva debe ser un número entero (en centavos MXN)' })
  @Min(1, { message: 'El precio de reserva debe ser mayor a $0' })
  @IsOptional()
  reservePrice?: number;

  @IsArray({ message: 'Las imágenes deben ser una lista de URLs' })
  @IsUrl({}, { each: true, message: 'Cada imagen debe ser una URL válida' })
  @IsOptional()
  imageUrls?: string[];

  @IsInt({ message: 'El precio de compra inmediata debe ser un número entero (en centavos MXN)' })
  @Min(1, { message: 'El precio de compra inmediata debe ser mayor a $0' })
  @IsOptional()
  binPrice?: number;

  @IsString({ message: 'La empresa de gradación debe ser texto (ej. PSA, BGS, CGC)' })
  @IsOptional()
  gradingCompany?: string;

  @IsString({ message: 'El grado debe ser texto (ej. 9, 9.5, 10)' })
  @IsOptional()
  grade?: string;

  @IsBoolean({ message: 'El campo de re-publicación automática debe ser verdadero o falso' })
  @IsOptional()
  autoRelist?: boolean;
}

export class CreateAuctionDto {
  @IsString({ message: 'El título de la subasta debe ser texto' })
  @IsNotEmpty({ message: 'El título de la subasta es requerido' })
  title: string;

  @IsString({ message: 'El juego debe ser texto' })
  @IsOptional()
  game?: AuctionGame;

  @IsString({ message: 'La descripción debe ser texto' })
  @IsOptional()
  description?: string;

  @IsDateString({}, { message: 'La fecha programada debe tener formato de fecha válido' })
  @IsOptional()
  scheduledAt?: string;

  @IsBoolean({ message: 'El campo isStream debe ser verdadero o falso' })
  @IsOptional()
  isStream?: boolean;

  @IsArray({ message: 'Los artículos deben ser una lista' })
  @ValidateNested({ each: true })
  @Type(() => CreateAuctionItemDto)
  @IsOptional()
  items?: CreateAuctionItemDto[];
}
