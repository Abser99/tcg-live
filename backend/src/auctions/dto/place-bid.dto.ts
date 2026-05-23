import { IsInt, Max, Min } from 'class-validator';

// 1,000,000 MXN expressed in cents — hard upper ceiling per bid
const MAX_BID_CENTS = 100_000_000;

export class PlaceBidDto {
  @IsInt()
  @Min(1)
  @Max(MAX_BID_CENTS)
  amount: number; // MXN cents
}
