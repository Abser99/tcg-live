import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { AuthGuard } from '@nestjs/passport';
import { SellerDocumentsService } from './seller-documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UploadDocumentUrlDto } from './dto/upload-document-url.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/user.entity';
import { DocumentStatus } from './seller-document.entity';

interface MulterFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  filename: string;
  path: string;
  buffer: Buffer;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

const storage = diskStorage({
  destination: './uploads/seller-documents',
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

function fileFilter(_req: any, file: MulterFile, cb: (err: Error | null, accept: boolean) => void) {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestException('Solo se permiten imágenes JPEG/PNG y PDFs'), false);
  }
}

@Controller('seller-documents')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SellerDocumentsController {
  constructor(private readonly service: SellerDocumentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: User,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: MulterFile,
  ) {
    if (!file) throw new BadRequestException('Se requiere un archivo');
    const fileUrl = `/uploads/seller-documents/${file.filename}`;
    return this.service.upload(user.id, dto, fileUrl);
  }

  @Post('from-url')
  uploadFromUrl(@CurrentUser() user: User, @Body() dto: UploadDocumentUrlDto) {
    return this.service.upload(user.id, dto, dto.fileUrl);
  }

  @Get('me')
  myDocuments(@CurrentUser() user: User) {
    return this.service.getMyDocuments(user.id);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  findAll(@Query('status') status?: DocumentStatus) {
    return this.service.findAll(status);
  }

  @Patch(':id/review')
  @Roles(UserRole.ADMIN)
  review(
    @Param('id') id: string,
    @CurrentUser() admin: User,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.service.review(id, admin.id, dto);
  }
}
