import { IsInt, Min } from 'class-validator';

export class SetMaxBidDto {
  @IsInt()
  @Min(1)
  maxAmount: number;
}
