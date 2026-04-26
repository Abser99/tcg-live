import { IsInt, Min } from 'class-validator';

export class PlaceBidDto {
  @IsInt()
  @Min(1)
  amount: number; // MXN cents
}
