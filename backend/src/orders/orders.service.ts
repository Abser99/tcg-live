import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus, PaymentStatus, PayoutStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

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
        payoutStatus: PayoutStatus.PENDING,
        totalCents: finalPrice,
        ...(buyerZip && { buyerZip }),
      });
      order = await this.ordersRepo.save(order);
    } else {
      // Accumulate additional items into the running total
      order.totalCents = (order.totalCents ?? 0) + finalPrice;
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

  async createForListing(params: {
    listingId: string;
    listingTitle: string;
    priceCents: number;
    sellerId: string;
    buyerId: string;
    imageUrls?: string[];
  }): Promise<Order> {
    const { listingId, listingTitle, priceCents, sellerId, buyerId, imageUrls } = params;
    let order = this.ordersRepo.create({
      listingId, sellerId, buyerId,
      status: OrderStatus.PENDING,
      payoutStatus: PayoutStatus.PENDING,
      totalCents: priceCents,
    });
    order = await this.ordersRepo.save(order);

    await this.itemsRepo.save(
      this.itemsRepo.create({ orderId: order.id, cardName: listingTitle, finalPrice: priceCents, imageUrls }),
    );

    const [buyer, seller] = await Promise.all([
      this.usersService.findById(buyerId),
      this.usersService.findById(sellerId),
    ]);
    this.notificationsService.notifyNewOrder(sellerId, buyer.username, 1).catch(() => {});
    this.emailService.sendOrderConfirmationBuyer(buyer.email, {
      cardName: listingTitle, amount: priceCents, sellerName: seller.username, orderId: order.id,
    }).catch(() => {});
    this.emailService.sendOrderConfirmationSeller(seller.email, {
      cardName: listingTitle, amount: priceCents, buyerName: buyer.username, orderId: order.id,
    }).catch(() => {});

    return this.ordersRepo.findOne({ where: { id: order.id }, relations: ['items'] }) as Promise<Order>;
  }

  /**
   * Hand a prize to a giveaway winner.
   *
   * Same shipping path as a purchase — the winner still gives an address and confirms
   * receipt — but there is nothing to pay, so it skips straight past checkout instead of
   * sitting in "pendiente de pago" forever.
   */
  /**
   * A prize handed over. `listingId` is optional: a raffle can name its prize without
   * it being a catalogue item, and that win still has to leave a record — the seller
   * needs to know what they owe and to whom once the live is over.
   */
  async createForGiveaway(params: {
    listingId?: string;
    listingTitle: string;
    sellerId: string;
    winnerId: string;
    auctionId?: string;
    imageUrls?: string[];
  }): Promise<Order> {
    const { listingId, listingTitle, sellerId, winnerId, auctionId, imageUrls } = params;
    let order = this.ordersRepo.create({
      ...(listingId && { listingId }),
      sellerId,
      buyerId: winnerId,
      ...(auctionId && { auctionId }),
      isGiveaway: true,
      totalCents: 0,
      status: OrderStatus.CONFIRMED,      // nothing to pay → straight to preparing
      paymentStatus: PaymentStatus.PAID,
      payoutStatus: PayoutStatus.PENDING,
    });
    order = await this.ordersRepo.save(order);

    await this.itemsRepo.save(
      this.itemsRepo.create({ orderId: order.id, cardName: listingTitle, finalPrice: 0, imageUrls }),
    );

    const [winner, seller] = await Promise.all([
      this.usersService.findById(winnerId),
      this.usersService.findById(sellerId),
    ]);
    this.notificationsService
      .notifyGiveawayWon(winnerId, seller.username, listingTitle)
      .catch(() => {});
    this.notificationsService.notifyNewOrder(sellerId, winner.username, 1).catch(() => {});

    return this.ordersRepo.findOne({ where: { id: order.id }, relations: ['items'] }) as Promise<Order>;
  }

  /**
   * Attach the counterparty (who bought / who sold) to a list of orders.
   *
   * Done here rather than with a TypeORM relation: orders.buyerId/sellerId are varchar
   * while users.id is uuid, so declaring a relation makes schema sync rewrite the orders
   * table. One extra lookup keyed by id avoids touching the schema at all.
   */
  private async attachCounterparties(orders: Order[], side: 'buyer' | 'seller'): Promise<Order[]> {
    const ids = [...new Set(orders.map(o => (side === 'buyer' ? o.buyerId : o.sellerId)).filter(Boolean))];
    if (!ids.length) return orders;
    const users = await Promise.all(
      ids.map(id => this.usersService.findById(id).catch(() => null)), // a deleted user just stays blank
    );
    const byId = new Map(
      users.filter((u): u is NonNullable<typeof u> => !!u).map(u => [u.id, { id: u.id, username: u.username }]),
    );
    for (const o of orders) {
      const who = byId.get(side === 'buyer' ? o.buyerId : o.sellerId);
      if (who) o[side] = who;
    }
    return orders;
  }

  async getMyOrders(buyerId: string): Promise<Order[]> {
    const orders = await this.ordersRepo.find({
      where: { buyerId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
    // The buyer's list shows who they bought from.
    return this.attachCounterparties(orders, 'seller');
  }

  async getSellerOrders(sellerId: string): Promise<Order[]> {
    const orders = await this.ordersRepo.find({
      where: { sellerId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
    // The seller's list shows who bought.
    return this.attachCounterparties(orders, 'buyer');
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
    order.payoutStatus = PayoutStatus.PENDING;
    order.payoutAmount = Math.round((order.totalCents ?? 0) * 0.92); // 8% platform commission
    await this.ordersRepo.save(order);
    this.notificationsService.notifyPaymentReceived(order.sellerId, order.id).catch(() => {});
  }

  async releasePayment(orderId: string, adminId: string): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException('La orden no ha sido pagada todavía');
    }
    if (order.payoutStatus === PayoutStatus.RELEASED) {
      throw new BadRequestException('El pago ya fue liberado');
    }

    // Get seller info for payout
    const seller = await this.usersService.findById(order.sellerId);

    // TODO Phase 2: Call MP Disbursements API here when MP Marketplace is approved
    // For now: mark as released and log for manual transfer
    this.logger.log(
      `PAYOUT RELEASE — orderId=${orderId} amount=${order.payoutAmount} cents ` +
      `seller=${seller.username} clabe=${seller.clabe ?? 'N/A'} mpEmail=${seller.mpPayoutEmail ?? 'N/A'} ` +
      `releasedBy=${adminId}`
    );

    order.payoutStatus = PayoutStatus.RELEASED;
    order.payoutReleasedAt = new Date();
    await this.ordersRepo.save(order);

    // Notify seller
    this.notificationsService.sendToUser(order.sellerId, {
      title: '¡Tu pago fue liberado!',
      body: `Recibirás $${((order.payoutAmount ?? 0) / 100).toFixed(2)} MXN en tu cuenta registrada.`,
      data: { type: 'payout_released', orderId },
    }).catch(() => {});

    return order;
  }

  async markDelivered(orderId: string): Promise<void> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order || order.status === OrderStatus.DELIVERED) return;
    order.status = OrderStatus.DELIVERED;
    await this.ordersRepo.save(order);
    // Auto-release payout when carrier confirms delivery
    if (order.paymentStatus === PaymentStatus.PAID && order.payoutStatus === PayoutStatus.PENDING) {
      await this.releasePayment(orderId, 'carrier-webhook');
    }
  }

  async findPendingPayouts(): Promise<Order[]> {
    return this.ordersRepo.find({
      where: { paymentStatus: PaymentStatus.PAID, payoutStatus: PayoutStatus.PENDING },
      order: { updatedAt: 'ASC' },
    });
  }
}
