import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly repo: Repository<Message>,
    private readonly ordersService: OrdersService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
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

  async getThreadsForUser(userId: string): Promise<object[]> {
    // Get all orders where the user is buyer or seller that have at least one message
    const orders = await this.ordersService.getOrdersForUser(userId);

    const threads = await Promise.all(
      orders.map(async (order) => {
        const messages = await this.repo.find({
          where: { orderId: order.id },
          order: { createdAt: 'DESC' },
          take: 1,
        });
        if (messages.length === 0) return null;

        const otherUserId = order.buyerId === userId ? order.sellerId : order.buyerId;
        let otherUsername = 'Usuario';
        try {
          const otherUser = await this.usersService.findById(otherUserId);
          otherUsername = otherUser.username;
        } catch {}

        return {
          id: order.id,
          orderId: order.id,
          otherUser: { username: otherUsername },
          lastMessage: {
            content: messages[0].body,
            createdAt: messages[0].createdAt,
          },
          unreadCount: 0,
        };
      }),
    );

    return threads.filter((t): t is NonNullable<typeof t> => t !== null);
  }
}
