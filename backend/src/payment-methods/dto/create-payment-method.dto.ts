import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaymentMethodType } from '../entities/payment-method.entity';

export class CreatePaymentMethodDto {
  @IsEnum(PaymentMethodType)
  type: PaymentMethodType;

  /* Card fields. The number is never stored — it's read once for the brand and the
     last four, then dropped. Length is checked per brand in the service, because
     "13 to 19 digits" accepts a 16-digit Amex, which does not exist. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{13,19}$/, { message: 'El número de tarjeta debe tener entre 13 y 19 dígitos' })
  cardNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\/\d{2}$/, { message: 'La vigencia va como MM/AA' })
  expiry?: string;

  /** Optional — a card is identified by its brand and last four, not by a name. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  cardholderName?: string;

  // ── Billing address ──
  @IsOptional() @IsString() @MaxLength(80)  billingName?: string;
  @IsOptional() @IsString() @MaxLength(120) street?: string;
  @IsOptional() @IsString() @MaxLength(20)  extNumber?: string;
  @IsOptional() @IsString() @MaxLength(20)  intNumber?: string;
  @IsOptional() @IsString() @MaxLength(80)  colonia?: string;
  @IsOptional() @IsString() @MaxLength(80)  city?: string;
  @IsOptional() @IsString() @MaxLength(60)  state?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{5}$/, { message: 'El código postal son 5 dígitos' })
  zip?: string;
}
