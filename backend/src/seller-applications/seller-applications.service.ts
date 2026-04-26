import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SellerApplication, ApplicationStatus } from './seller-application.entity';
import { ApplySellerDto } from './dto/apply-seller.dto';
import { ReviewApplicationDto } from './dto/review-application.dto';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user.entity';

@Injectable()
export class SellerApplicationsService {
  constructor(
    @InjectRepository(SellerApplication)
    private readonly repo: Repository<SellerApplication>,
    private readonly usersService: UsersService,
  ) {}

  async apply(userId: string, dto: ApplySellerDto): Promise<SellerApplication> {
    const user = await this.usersService.findById(userId);

    if (user.role === UserRole.SELLER || user.role === UserRole.ADMIN) {
      throw new BadRequestException('Ya eres vendedor o administrador');
    }

    const existing = await this.repo.findOne({
      where: { userId, status: ApplicationStatus.PENDING },
    });
    if (existing) {
      throw new BadRequestException('Ya tienes una solicitud pendiente');
    }

    const application = this.repo.create({ userId, ...dto });
    return this.repo.save(application);
  }

  async getMyApplication(userId: string): Promise<SellerApplication | null> {
    return this.repo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(status?: ApplicationStatus): Promise<SellerApplication[]> {
    return this.repo.find({
      where: status ? { status } : {},
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  async review(
    applicationId: string,
    adminId: string,
    dto: ReviewApplicationDto,
  ): Promise<SellerApplication> {
    const application = await this.repo.findOne({
      where: { id: applicationId },
      relations: ['user'],
    });
    if (!application) throw new NotFoundException('Solicitud no encontrada');
    if (application.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException('Esta solicitud ya fue revisada');
    }

    application.status = dto.status;
    application.reviewedBy = adminId;
    application.reviewNote = dto.reviewNote ?? null;
    application.reviewedAt = new Date();

    if (dto.status === ApplicationStatus.APPROVED) {
      await this.usersService.updateRole(application.userId, UserRole.SELLER);
    }

    return this.repo.save(application);
  }
}
