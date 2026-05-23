import { IsInt, Max, Min } from 'class-validator';

// Mirror the cap from PlaceBidDto — 1,000,000 MXN in cents
const MAX_BID_CENTS = 100_000_000;

export class SetMaxBidDto {
  @IsInt()
  @Min(1)
  @Max(MAX_BID_CENTS)
  maxAmount: number;
}
