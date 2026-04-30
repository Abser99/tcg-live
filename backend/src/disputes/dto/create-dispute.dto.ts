import { IsEnum, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { DisputeReason } from '../entities/dispute.entity';

export class CreateDisputeDto {
  @IsUUID()
  orderId: string;

  @IsEnum(DisputeReason)
  reason: DisputeReason;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description: string;
}
