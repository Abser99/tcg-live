import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SellerDocument, DocumentType, DocumentStatus } from './seller-document.entity';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class SellerDocumentsService {
  constructor(
    @InjectRepository(SellerDocument)
    private readonly repo: Repository<SellerDocument>,
    private readonly usersService: UsersService,
  ) {}

  async upload(userId: string, dto: UploadDocumentDto, fileUrl: string): Promise<SellerDocument> {
    this.validateEmissionDate(dto.documentType, dto.emissionDate ?? null);
    const doc = this.repo.create({
      userId,
      documentType: dto.documentType,
      fileUrl,
      emissionDate: dto.emissionDate ?? null,
    });
    return this.repo.save(doc);
  }

  async getMyDocuments(userId: string): Promise<SellerDocument[]> {
    // Return the latest upload per document type
    const all = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const seen = new Set<DocumentType>();
    const latest: SellerDocument[] = [];
    for (const doc of all) {
      if (!seen.has(doc.documentType)) {
        seen.add(doc.documentType);
        latest.push(doc);
      }
    }
    return latest;
  }

  async findAll(status?: DocumentStatus): Promise<SellerDocument[]> {
    return this.repo.find({
      where: status ? { status } : {},
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  async review(id: string, adminId: string, dto: ReviewDocumentDto): Promise<SellerDocument> {
    const doc = await this.repo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.status !== DocumentStatus.PENDING) {
      throw new BadRequestException('Este documento ya fue revisado');
    }
    doc.status = dto.status;
    doc.reviewedBy = adminId;
    doc.rejectionNote = dto.rejectionNote ?? null;
    doc.reviewedAt = new Date();
    const saved = await this.repo.save(doc);

    // Mark user as verified when any document is approved
    if (dto.status === DocumentStatus.APPROVED) {
      await this.usersService.setVerified(doc.userId, true).catch(() => {});
    }

    return saved;
  }

  private validateEmissionDate(type: DocumentType, emissionDate: string | null): void {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const needsCurrentMonth = [DocumentType.CONSTANCIA_FISCAL, DocumentType.OPINION_CUMPLIMIENTO];
    const needsThreeMonths  = [DocumentType.COMPROBANTE_DOMICILIO];

    if (needsCurrentMonth.includes(type)) {
      if (!emissionDate) {
        throw new BadRequestException('Se requiere fecha de emisión para este documento');
      }
      const d = new Date(emissionDate + 'T12:00:00');
      if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) {
        throw new BadRequestException('El documento debe ser del mes en curso');
      }
    }

    if (needsThreeMonths.includes(type)) {
      if (!emissionDate) {
        throw new BadRequestException('Se requiere fecha de emisión para este documento');
      }
      const d = new Date(emissionDate + 'T12:00:00');
      const threeMonthsAgo = new Date(currentYear, currentMonth - 3, 1);
      if (d < threeMonthsAgo) {
        throw new BadRequestException('El comprobante no puede tener más de 3 meses de antigüedad');
      }
    }
  }
}
