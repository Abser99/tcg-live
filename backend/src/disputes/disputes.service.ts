import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentStatus } from '../orders/entities/order.entity';

@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(Dispute)
    private readonly repo: Repository<Dispute>,
    private readonly ordersService: OrdersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async openDispute(buyerId: string, dto: CreateDisputeDto): Promise<Dispute> {
    const order = await this.ordersService.findById(dto.orderId);
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.buyerId !== buyerId) throw new ForbiddenException();
    if (order.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException('Solo puedes abrir una disputa en órdenes pagadas');
    }
    if (order.status === 'delivered') {
      throw new BadRequestException('No se puede abrir una disputa en una orden ya entregada');
    }

    const existing = await this.repo.findOne({
      where: { orderId: dto.orderId, status: DisputeStatus.OPEN },
    });
    if (existing) throw new BadRequestException('Ya existe una disputa abierta para esta orden');

    const dispute = this.repo.create({
      orderId: dto.orderId,
      buyerId,
      sellerId: order.sellerId,
      reason: dto.reason,
      description: dto.description,
    });
    const saved = await this.repo.save(dispute);

    this.notificationsService
      .notifyDisputeOpened(order.sellerId, dto.orderId)
      .catch(() => {});

    return saved;
  }

  async findMine(userId: string): Promise<Dispute[]> {
    return this.repo.find({
      where: [{ buyerId: userId }, { sellerId: userId }],
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<Dispute[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async resolve(disputeId: string, dto: ResolveDisputeDto): Promise<Dispute> {
    const dispute = await this.repo.findOne({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Disputa no encontrada');
    if (dispute.status === DisputeStatus.RESOLVED || dispute.status === DisputeStatus.REJECTED) {
      throw new BadRequestException('Esta disputa ya fue resuelta');
    }

    dispute.status = dto.status;
    dispute.resolutionNote = dto.resolutionNote;
    const saved = await this.repo.save(dispute);

    this.notificationsService
      .notifyDisputeResolved(dispute.buyerId, dto.status, dto.resolutionNote)
      .catch(() => {});

    return saved;
  }
}
