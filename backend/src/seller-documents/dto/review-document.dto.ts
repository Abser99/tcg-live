import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DocumentStatus } from '../seller-document.entity';

export class ReviewDocumentDto {
  @IsEnum([DocumentStatus.APPROVED, DocumentStatus.REJECTED])
  status: DocumentStatus.APPROVED | DocumentStatus.REJECTED;

  @IsOptional()
  @IsString()
  rejectionNote?: string;
}
