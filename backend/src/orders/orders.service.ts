import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus, PaymentStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)  private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly itemsRepo: Repository<OrderItem>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Called by AuctionsService when an item is closed with a winner */
  async recordWin(params: {
    auctionId: string;
    sellerId: string;
    buyerId: string;
    buyerZip?: string | null;
    auctionItemId: string;
    cardName: string;
    cardSet: string | null;
    finalPrice: number;
    imageUrls: string[] | null;
  }): Promise<void> {
    const { auctionId, sellerId, buyerId, buyerZip, auctionItemId, cardName, cardSet, finalPrice, imageUrls } = params;

    let order = await this.ordersRepo.findOne({ where: { auctionId, buyerId } });
    const isNewOrder = !order;

    if (!order) {
      order = this.ordersRepo.create({
        auctionId, sellerId, buyerId,
        status: OrderStatus.PENDING,
        ...(buyerZip && { buyerZip }),
      });
      order = await this.ordersRepo.save(order);
    }

    await this.itemsRepo.save(
      this.itemsRepo.create({ orderId: order.id, auctionItemId, cardName, cardSet: cardSet ?? undefined, finalPrice, imageUrls: imageUrls ?? undefined }),
    );

    // Notify buyer they won this item
    this.notificationsService.notifyAuctionWin(buyerId, cardName, finalPrice).catch(() => {});

    // Notify seller of a new sale only when the order is first created
    if (isNewOrder) {
      const buyer = await this.usersService.findById(buyerId);
      this.notificationsService.notifyNewOrder(sellerId, buyer.username, 1).catch(() => {});
    }
  }

  async getMyOrders(buyerId: string): Promise<Order[]> {
    return this.ordersRepo.find({
      where: { buyerId },
      order: { createdAt: 'DESC' },
    });
  }

  async getAuctionOrders(auctionId: string, sellerId: string): Promise<Order[]> {
    const orders = await this.ordersRepo.find({
      where: { auctionId },
      order: { createdAt: 'ASC' },
    });
    if (orders.length && orders[0].sellerId !== sellerId) {
      throw new ForbiddenException();
    }
    return orders;
  }

  async setShippingChoice(orderId: string, buyerId: string, choice: 'combined' | 'individual'): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId, buyerId } });
    if (!order) throw new NotFoundException('Order not found');
    order.shippingChoice = choice;
    return this.ordersRepo.save(order);
  }

  async updateStatus(orderId: string, sellerId: string, status: OrderStatus): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId, sellerId } });
    if (!order) throw new NotFoundException('Order not found');
    const allowed: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]:   [OrderStatus.CONFIRMED],
      [OrderStatus.CONFIRMED]: [OrderStatus.SHIPPED],
      [OrderStatus.SHIPPED]:   [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [],
    };
    if (!allowed[order.status].includes(status)) {
      throw new BadRequestException(`Cannot transition from ${order.status} to ${status}`);
    }
    if (status === OrderStatus.CONFIRMED && order.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException('El comprador aún no ha realizado el pago');
    }
    order.status = status;
    const saved = await this.ordersRepo.save(order);
    // Push notifications on status transitions
    if (status === OrderStatus.CONFIRMED) {
      const cardNames = order.items.map(i => i.cardName);
      this.notificationsService.notifyOrderConfirmed(order.buyerId, cardNames).catch(() => {});
    } else if (status === OrderStatus.SHIPPED && order.trackingNumber) {
      this.notificationsService.notifyOrderShipped(order.buyerId, order.trackingNumber, order.carrier ?? 'Paquetería').catch(() => {});
    }
    return saved;
  }

  async confirmReceived(orderId: string, buyerId: string): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId, buyerId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.SHIPPED) {
      throw new BadRequestException('El pedido aún no ha sido marcado como enviado');
    }
    order.status = OrderStatus.DELIVERED;
    const saved = await this.ordersRepo.save(order);
    const buyer = await this.usersService.findById(order.buyerId);
    this.notificationsService.notifyOrderDelivered(order.sellerId, buyer.username).catch(() => {});
    return saved;
  }

  async rateOrder(orderId: string, buyerId: string, rating: number, note?: string): Promise<Order> {
    if (rating < 1 || rating > 5) throw new BadRequestException('Rating must be 1–5');
    const order = await this.ordersRepo.findOne({ where: { id: orderId, buyerId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Solo puedes calificar órdenes entregadas');
    }
    if (order.sellerRating) throw new BadRequestException('Ya calificaste esta orden');
    order.sellerRating = rating;
    if (note) order.sellerRatingNote = note;
    const saved = await this.ordersRepo.save(order);
    await this.usersService.recordRating(order.sellerId, rating);
    return saved;
  }

  async attachShipping(orderId: string, sellerId: string, data: {
    shippingCost: number;
    carrier: string;
    trackingNumber: string;
    labelUrl: string;
  }): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId, sellerId } });
    if (!order) throw new NotFoundException('Order not found');
    Object.assign(order, data);
    return this.ordersRepo.save(order);
  }

  async getSellerStats(sellerId: string) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const paidOrders = await this.ordersRepo.find({
      where: { sellerId, paymentStatus: PaymentStatus.PAID },
    });

    const allItems = paidOrders.flatMap(o => o.items);
    const weekItems = paidOrders
      .filter(o => new Date(o.createdAt) >= weekAgo)
      .flatMap(o => o.items);

    const pendingShipments = paidOrders.filter(
      o => o.status !== OrderStatus.DELIVERED,
    ).length;

    const bestCard = allItems.reduce<{ cardName: string; priceCents: number } | null>(
      (best, item) =>
        !best || item.finalPrice > best.priceCents
          ? { cardName: item.cardName, priceCents: item.finalPrice }
          : best,
      null,
    );

    return {
      totalRevenueCents: allItems.reduce((s, i) => s + i.finalPrice, 0),
      weekRevenueCents:  weekItems.reduce((s, i) => s + i.finalPrice, 0),
      totalSold:         allItems.length,
      weekSold:          weekItems.length,
      pendingShipments,
      bestCard,
    };
  }

  async findById(orderId: string): Promise<Order | null> {
    return this.ordersRepo.findOne({ where: { id: orderId } });
  }

  async getOrderForCheckout(orderId: string, buyerId: string): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId, buyerId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.paymentStatus === PaymentStatus.PAID) throw new BadRequestException('Order already paid');
    return order;
  }

  async storePreference(orderId: string, mpPreferenceId: string, autoApprove: boolean): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    order.mpPreferenceId = mpPreferenceId;
    if (autoApprove) {
      order.paymentStatus = PaymentStatus.PAID;
    }
    const saved = await this.ordersRepo.save(order);
    if (autoApprove) {
      this.notificationsService.notifyPaymentReceived(order.sellerId, order.id).catch(() => {});
    }
    return saved;
  }

  async markPaidByOrderId(orderId: string, mpPaymentId: string): Promise<void> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order || order.paymentStatus === PaymentStatus.PAID) return;
    order.paymentStatus = PaymentStatus.PAID;
    order.mpPaymentId = mpPaymentId;
    await this.ordersRepo.save(order);
    this.notificationsService.notifyPaymentReceived(order.sellerId, order.id).catch(() => {});
  }
}
