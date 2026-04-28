import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { PaymentMethodType } from '../entities/payment-method.entity';

export class CreatePaymentMethodDto {
  @IsEnum(PaymentMethodType)
  type: PaymentMethodType;

  // Card only fields — never stored raw, only used to extract last4/brand
  @IsOptional()
  @IsString()
  @Matches(/^\d{13,19}$/, { message: 'Número de tarjeta inválido' })
  cardNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\/\d{2}$/, { message: 'Expiración inválida (MM/YY)' })
  expiry?: string;

  @IsOptional()
  @IsString()
  cardholderName?: string;
}
