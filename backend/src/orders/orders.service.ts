import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus, PaymentStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)  private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly itemsRepo: Repository<OrderItem>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
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

    // Push notification: buyer won item
    this.notificationsService.notifyAuctionWin(buyerId, cardName, finalPrice).catch(() => {});

    // Notify seller of a new sale only when the order is first created
    if (isNewOrder) {
      const [buyer, seller] = await Promise.all([
        this.usersService.findById(buyerId),
        this.usersService.findById(sellerId),
      ]);
      this.notificationsService.notifyNewOrder(sellerId, buyer.username, 1).catch(() => {});

      // Transactional emails: buyer confirmation + seller confirmation
      this.emailService.sendOrderConfirmationBuyer(buyer.email, {
        cardName,
        amount: finalPrice,
        sellerName: seller.username,
        orderId: order.id,
      }).catch(() => {});

      this.emailService.sendOrderConfirmationSeller(seller.email, {
        cardName,
        amount: finalPrice,
        buyerName: buyer.username,
        orderId: order.id,
      }).catch(() => {});
    }
  }

  async getMyOrders(buyerId: string): Promise<Order[]> {
    return this.ordersRepo.find({
      where: { buyerId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  async getSellerOrders(sellerId: string): Promise<Order[]> {
    return this.ordersRepo.find({
      where: { sellerId },
      relations: ['items'],
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
    if (!order) throw new NotFoundException('Orden no encontrada');
    order.shippingChoice = choice;
    return this.ordersRepo.save(order);
  }

  async updateStatus(orderId: string, sellerId: string, status: OrderStatus): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId, sellerId }, relations: ['items'] });
    if (!order) throw new NotFoundException('Orden no encontrada');
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

      // Email: buyer shipment notification
      this.usersService.findById(order.buyerId)
        .then(buyer => {
          const firstCardName = order.items[0]?.cardName ?? 'tu carta';
          return this.emailService.sendOrderShipped(buyer.email, {
            cardName: firstCardName,
            trackingNumber: order.trackingNumber!,
            orderId: order.id,
          });
        })
        .catch(() => {});
    }
    return saved;
  }

  async confirmReceived(orderId: string, buyerId: string): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId, buyerId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
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
    if (rating < 1 || rating > 5) throw new BadRequestException('La calificación debe ser entre 1 y 5');
    const order = await this.ordersRepo.findOne({ where: { id: orderId, buyerId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
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

  async updateTracking(orderId: string, sellerId: string, trackingNumber: string): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId, sellerId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    order.trackingNumber = trackingNumber;
    return this.ordersRepo.save(order);
  }

  async attachShipping(orderId: string, sellerId: string, data: {
    shippingCost: number;
    carrier: string;
    trackingNumber: string;
    labelUrl: string;
  }): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId, sellerId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    Object.assign(order, data);
    return this.ordersRepo.save(order);
  }

  async getSellerStats(sellerId: string) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Use aggregate queries instead of loading all rows into memory
    const [totalStats, weekStats, pendingShipments, bestCardRow] = await Promise.all([
      // All-time: total revenue + items sold
      this.itemsRepo
        .createQueryBuilder('oi')
        .select('COALESCE(SUM(oi."finalPrice"), 0)', 'revenue')
        .addSelect('COUNT(oi.id)', 'sold')
        .innerJoin('oi.order', 'o')
        .where('o."sellerId" = :sellerId', { sellerId })
        .andWhere('o."paymentStatus" = :paid', { paid: PaymentStatus.PAID })
        .getRawOne<{ revenue: string; sold: string }>(),

      // This week: revenue + items sold
      this.itemsRepo
        .createQueryBuilder('oi')
        .select('COALESCE(SUM(oi."finalPrice"), 0)', 'revenue')
        .addSelect('COUNT(oi.id)', 'sold')
        .innerJoin('oi.order', 'o')
        .where('o."sellerId" = :sellerId', { sellerId })
        .andWhere('o."paymentStatus" = :paid', { paid: PaymentStatus.PAID })
        .andWhere('o."createdAt" >= :weekAgo', { weekAgo })
        .getRawOne<{ revenue: string; sold: string }>(),

      // Count pending shipments (paid, not yet delivered)
      this.ordersRepo.count({
        where: {
          sellerId,
          paymentStatus: PaymentStatus.PAID,
        },
      }).then(total =>
        this.ordersRepo.count({
          where: { sellerId, paymentStatus: PaymentStatus.PAID, status: OrderStatus.DELIVERED },
        }).then(delivered => total - delivered)
      ),

      // Best card by final price
      this.itemsRepo
        .createQueryBuilder('oi')
        .select('oi."cardName"', 'cardName')
        .addSelect('oi."finalPrice"', 'priceCents')
        .innerJoin('oi.order', 'o')
        .where('o."sellerId" = :sellerId', { sellerId })
        .andWhere('o."paymentStatus" = :paid', { paid: PaymentStatus.PAID })
        .orderBy('oi."finalPrice"', 'DESC')
        .limit(1)
        .getRawOne<{ cardName: string; priceCents: number }>(),
    ]);

    return {
      totalRevenueCents: parseInt(totalStats?.revenue ?? '0', 10),
      weekRevenueCents:  parseInt(weekStats?.revenue ?? '0', 10),
      totalSold:         parseInt(totalStats?.sold ?? '0', 10),
      weekSold:          parseInt(weekStats?.sold ?? '0', 10),
      pendingShipments,
      bestCard:          bestCardRow ?? null,
    };
  }

  async findById(orderId: string): Promise<Order | null> {
    return this.ordersRepo.findOne({ where: { id: orderId } });
  }

  async getOrdersForUser(userId: string): Promise<Order[]> {
    return this.ordersRepo.find({
      where: [{ buyerId: userId }, { sellerId: userId }],
      order: { updatedAt: 'DESC' },
    });
  }

  async getOrderForCheckout(orderId: string, buyerId: string): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId, buyerId }, relations: ['items'] });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.paymentStatus === PaymentStatus.PAID) throw new BadRequestException('La orden ya fue pagada');
    return order;
  }

  async storePreference(orderId: string, mpPreferenceId: string, autoApprove: boolean): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
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
