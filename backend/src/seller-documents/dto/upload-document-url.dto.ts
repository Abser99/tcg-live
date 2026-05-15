import { IsEnum, IsOptional, IsString, IsUrl, Matches } from 'class-validator';
import { DocumentType } from '../seller-document.entity';

export class UploadDocumentUrlDto {
  @IsEnum(DocumentType)
  documentType: DocumentType;

  @IsUrl()
  fileUrl: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'emissionDate must be YYYY-MM-DD' })
  emissionDate?: string;
}
