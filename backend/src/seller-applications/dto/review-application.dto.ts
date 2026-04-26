import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApplicationStatus } from '../seller-application.entity';

export class ReviewApplicationDto {
  @IsEnum([ApplicationStatus.APPROVED, ApplicationStatus.REJECTED])
  status: ApplicationStatus.APPROVED | ApplicationStatus.REJECTED;

  @IsString()
  @IsOptional()
  reviewNote?: string;
}
