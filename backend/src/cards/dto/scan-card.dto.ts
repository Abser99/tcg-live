import { IsString } from 'class-validator';

export class ScanCardDto {
  @IsString()
  imageBase64: string;

  @IsString()
  mimeType: string;
}
