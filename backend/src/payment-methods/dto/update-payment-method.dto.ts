import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * What can change on a saved card. The number can't: only its last four digits were
 * ever stored, so "editing" it would mean adding a different card.
 */
export class UpdatePaymentMethodDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\/\d{2}$/, { message: 'La vigencia va como MM/AA' })
  expiry?: string;

  @IsOptional() @IsString() @MaxLength(80)  cardholderName?: string;
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
