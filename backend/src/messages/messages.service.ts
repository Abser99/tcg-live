import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly repo: Repository<Message>,
    private readonly ordersService: OrdersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getMessages(orderId: string, userId: string): Promise<Message[]> {
    const order = await this.ordersService.findById(orderId);
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.buyerId !== userId && order.sellerId !== userId) throw new ForbiddenException();
    return this.repo.find({ where: { orderId }, order: { createdAt: 'ASC' }, take: 100 });
  }

  async save(orderId: string, senderId: string, senderUsername: string, body: string): Promise<Message> {
    const order = await this.ordersService.findById(orderId);
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.buyerId !== senderId && order.sellerId !== senderId) throw new ForbiddenException();

    const message = await this.repo.save(
      this.repo.create({ orderId, senderId, senderUsername, body }),
    );

    const recipientId = order.buyerId === senderId ? order.sellerId : order.buyerId;
    this.notificationsService
      .notifyNewMessage(recipientId, senderUsername, orderId)
      .catch(() => {});

    return message;
  }
}
