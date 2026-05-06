import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { DocumentType } from '../seller-document.entity';

export class UploadDocumentDto {
  @IsEnum(DocumentType)
  documentType: DocumentType;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'emissionDate must be YYYY-MM-DD' })
  emissionDate?: string;
}
