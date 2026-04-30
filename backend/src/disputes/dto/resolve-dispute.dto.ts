import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { DisputeStatus } from '../entities/dispute.entity';

const RESOLVABLE = [DisputeStatus.RESOLVED, DisputeStatus.REJECTED] as const;
type ResolvableStatus = typeof RESOLVABLE[number];

export class ResolveDisputeDto {
  @IsEnum(RESOLVABLE)
  status: ResolvableStatus;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  resolutionNote: string;
}
