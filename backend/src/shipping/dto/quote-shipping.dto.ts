import { IsString, IsNumber, IsPositive, Matches } from 'class-validator';

export class QuoteShippingDto {
  @IsString()
  @Matches(/^\d{5}$/)
  originZip: string;

  @IsString()
  @Matches(/^\d{5}$/)
  destinationZip: string;

  @IsNumber()
  @IsPositive()
  weightKg: number;

  @IsNumber()
  @IsPositive()
  items: number; // card count — used to estimate box dimensions
}

export interface ShippingQuote {
  carrierId: string;
  carrier: string;
  service: string;
  priceCents: number;
  estimatedDays: number;
}

export interface ShippingLabel {
  carrier: string;
  trackingNumber: string;
  labelUrl: string;
  priceCents: number;
}
