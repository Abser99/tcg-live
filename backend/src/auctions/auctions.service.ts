import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { Auction, AuctionGame, AuctionStatus } from './entities/auction.entity';
import { AuctionItem, AuctionItemStatus } from './entities/auction-item.entity';
import { Bid } from './entities/bid.entity';
import { MaxBid } from './entities/max-bid.entity';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { PlaceBidDto } from './dto/place-bid.dto';
import { SetMaxBidDto } from './dto/set-max-bid.dto';
import { AuctionsGateway } from './auctions.gateway';
import { UsersService } from '../users/users.service';
import { OrdersService } from '../orders/orders.service';
import { WatchlistService } from '../watchlist/watchlist.service';
import { FollowsService } from '../follows/follows.service';
import { NotificationsService } from '../notifications/notifications.service';

const MIN_BID_INCREMENT = 100; // 1 MXN in cents
const ITEM_TIMER_MS = 60_000;   // 60s per item
const ANTI_SNIPE_MS = 10_000;   // extend if bid within last 10s

@Injectable()
export class AuctionsService implements OnModuleInit {
  private readonly logger = new Logger(AuctionsService.name);

  constructor(
    @InjectRepository(Auction)
    private readonly auctionsRepo: Repository<Auction>,
    @InjectRepository(AuctionItem)
    private readonly itemsRepo: Repository<AuctionItem>,
    @InjectRepository(Bid)
    private readonly bidsRepo: Repository<Bid>,
    @InjectRepository(MaxBid)
    private readonly maxBidsRepo: Repository<MaxBid>,
    private readonly dataSource: DataSource,
    private readonly gateway: AuctionsGateway,
    private readonly usersService: UsersService,
    private readonly ordersService: OrdersService,
    private readonly watchlistService: WatchlistService,
    private readonly followsService: FollowsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
    // Auto-close auction items whose timer has expired (runs every 10 seconds)
    setInterval(() => this.autoCloseExpiredItems().catch(() => {}), 10_000);
  }

  private async autoCloseExpiredItems(): Promise<void> {
    const expired = await this.itemsRepo.find({
      where: { status: AuctionItemStatus.ACTIVE, closesAt: LessThan(new Date()) },
    });
    for (const item of expired) {
      try {
        // Use a conditional UPDATE to atomically claim this item — prevents double-close
        // in multi-instance deployments. Only the instance that rows-affected=1 proceeds.
        const result = await this.itemsRepo
          .createQueryBuilder()
          .update(AuctionItem)
          .set({
            status: item.winnerId ? AuctionItemStatus.SOLD : AuctionItemStatus.UNSOLD,
          })
          .where('id = :id AND status = :active', {
            id: item.id,
            active: AuctionItemStatus.ACTIVE,
          })
          .execute();

        if (result.affected === 0) {
          // Another instance already closed this item
          continue;
        }

        // Re-fetch to get the authoritative saved state
        const saved = await this.itemsRepo.findOne({ where: { id: item.id } });
        if (!saved) continue;

        await this.handleItemClosed(saved);
        this.logger.log(`Auto-closed item ${item.id} (${item.cardName})`);
      } catch (err) {
        this.logger.warn(`Failed to auto-close item ${item.id}: ${err}`);
      }
    }
  }

  async create(sellerId: string, dto: CreateAuctionDto): Promise<Auction> {
    const auction = this.auctionsRepo.create({
      sellerId,
      title: dto.title,
      game: dto.game,
      description: dto.description,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      items: (dto.items ?? []).map((item, index) =>
        this.itemsRepo.create({
          ...item,
          position: index,
          currentPrice: item.startingPrice,
          binPrice: item.binPrice ?? null,
          gradingCompany: item.gradingCompany ?? null,
          grade: item.grade ?? null,
        }),
      ),
    });
    return this.auctionsRepo.save(auction);
  }

  async findMy(sellerId: string): Promise<Auction[]> {
    return this.auctionsRepo.find({
      where: { sellerId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  async findBySeller(sellerId: string): Promise<Auction[]> {
    return this.auctionsRepo.find({
      where: { sellerId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }

  async findAll(params: {
    query?: string;
    game?: string;
    condition?: string;
    minPrice?: number;
    maxPrice?: number;
    page?: number;
    limit?: number;
  } = {}): Promise<{ data: Auction[]; total: number; page: number; limit: number }> {
    const { query, game, condition, minPrice, maxPrice } = params;
    const page  = Math.max(1, params.page  ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 20), 50);

    const qb = this.auctionsRepo.createQueryBuilder('a')
      .leftJoinAndSelect('a.seller', 'seller')
      .leftJoinAndSelect('a.items', 'items')
      .where('a.status IN (:...statuses)', { statuses: [AuctionStatus.SCHEDULED, AuctionStatus.LIVE] });

    if (query?.trim()) {
      const q = `%${query.toLowerCase().trim()}%`;
      qb.andWhere(
        `(LOWER(a.title) LIKE :q OR EXISTS (` +
        `SELECT 1 FROM auction_items ai ` +
        `WHERE ai."auctionId" = a.id ` +
        `AND (LOWER(ai."cardName") LIKE :q OR LOWER(ai."cardSet") LIKE :q)` +
        `))`,
        { q },
      );
    }

    if (game?.trim()) {
      qb.andWhere('a.game = :game', { game: game.trim() });
    }

    if (condition?.trim()) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM auction_items ai WHERE ai."auctionId" = a.id AND ai.condition = :condition)`,
        { condition: condition.trim() },
      );
    }

    if (minPrice != null && minPrice > 0) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM auction_items ai WHERE ai."auctionId" = a.id AND ai."startingPrice" >= :minPrice)`,
        { minPrice: minPrice * 100 },
      );
    }

    if (maxPrice != null && maxPrice > 0) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM auction_items ai WHERE ai."auctionId" = a.id AND ai."startingPrice" <= :maxPrice)`,
        { maxPrice: maxPrice * 100 },
      );
    }

    const [data, total] = await qb
      .orderBy('a.status', 'DESC')
      .addOrderBy('a.scheduledAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Auction> {
    const auction = await this.auctionsRepo.findOne({
      where: { id },
      relations: ['seller', 'items'],
    });
    if (!auction) throw new NotFoundException('Subasta no encontrada');
    return auction;
  }

  async update(id: string, sellerId: string, dto: { title?: string; game?: AuctionGame }): Promise<Auction> {
    const auction = await this.findOne(id);
    this.assertOwner(auction.sellerId, sellerId);
    if (auction.status === AuctionStatus.ENDED || auction.status === AuctionStatus.CANCELLED) {
      throw new BadRequestException('No se puede editar una subasta terminada');
    }
    if (dto.title) auction.title = dto.title;
    if (dto.game)  auction.game  = dto.game;
    await this.auctionsRepo.save(auction);
    return this.findOne(id);
  }

  async start(id: string, sellerId: string, durationMs?: number): Promise<Auction> {
    const auction = await this.findOne(id);
    this.assertOwner(auction.sellerId, sellerId);
    if (auction.status !== AuctionStatus.SCHEDULED) {
      throw new BadRequestException('La subasta no está en estado programado');
    }

    auction.status = AuctionStatus.LIVE;
    auction.startedAt = new Date();

    const firstItem = [...auction.items].sort((a, b) => a.position - b.position)[0];
    if (firstItem) {
      firstItem.status = AuctionItemStatus.ACTIVE;
      firstItem.closesAt = new Date(Date.now() + (durationMs ?? ITEM_TIMER_MS));
      await this.itemsRepo.save(firstItem);
    }

    const saved = await this.auctionsRepo.save(auction);

    if (firstItem) {
      this.gateway.emitAuctionStarted(id, { auctionId: id, firstItemId: firstItem.id });
    }

    this.watchlistService.notifyWatchers(id, auction.title).catch(() => {});
    this.followsService.notifyFollowers(auction.sellerId, auction.title, id).catch(() => {});

    return saved;
  }

  async end(id: string, sellerId: string): Promise<Auction> {
    const auction = await this.findOne(id);
    this.assertOwner(auction.sellerId, sellerId);
    if (auction.status !== AuctionStatus.LIVE) {
      throw new BadRequestException('La subasta no está en vivo');
    }

    auction.status = AuctionStatus.ENDED;
    auction.endedAt = new Date();
    const saved = await this.auctionsRepo.save(auction);

    this.gateway.emitAuctionEnded(id);

    return saved;
  }

  async placeBid(itemId: string, bidderId: string, dto: PlaceBidDto): Promise<Bid> {
    const { bid, auctionId, autoBid, closesAt, binTriggered, prevWinnerId, cardName } = await this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(AuctionItem, {
        where: { id: itemId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!item) throw new NotFoundException('Artículo no encontrado');
      if (item.status !== AuctionItemStatus.ACTIVE) {
        throw new BadRequestException('Este artículo no está activo en este momento');
      }

      const auction = await manager.findOne(Auction, { where: { id: item.auctionId } });
      if (auction!.status !== AuctionStatus.LIVE) {
        throw new BadRequestException('La subasta no está en vivo');
      }
      if (auction!.sellerId === bidderId) {
        throw new ForbiddenException('El vendedor no puede pujar en sus propios artículos');
      }
      if (dto.amount <= item.currentPrice) {
        throw new BadRequestException(
          `Bid must be greater than current price of ${item.currentPrice}`,
        );
      }

      const prevWinnerId = item.winnerId;
      item.currentPrice = dto.amount;
      item.winnerId = bidderId;

      // Buy It Now: if bid meets or exceeds BIN price, close immediately
      const binTriggered = !!(item.binPrice && dto.amount >= item.binPrice);
      if (binTriggered) {
        item.status = AuctionItemStatus.SOLD;
        item.closesAt = new Date();
      } else {
        // Anti-snipe: extend timer if bid lands in last 10 seconds
        if (item.closesAt) {
          const msLeft = item.closesAt.getTime() - Date.now();
          if (msLeft < ANTI_SNIPE_MS) {
            item.closesAt = new Date(Date.now() + ANTI_SNIPE_MS);
          }
        }
      }
      await manager.save(AuctionItem, item);

      const newBid = manager.create(Bid, { auctionItemId: itemId, bidderId, amount: dto.amount });
      const savedBid = await manager.save(Bid, newBid);

      // Auto-bid only runs when BIN was not triggered
      let autoBid: { bidderId: string; amount: number; bidId: string } | null = null;
      if (!binTriggered && prevWinnerId && prevWinnerId !== bidderId) {
        const maxBidRecord = await manager.findOne(MaxBid, {
          where: { auctionItemId: itemId, userId: prevWinnerId },
        });
        if (maxBidRecord) {
          const nextBid = dto.amount + MIN_BID_INCREMENT;
          if (nextBid <= maxBidRecord.maxAmountCents) {
            const autoBidEntity = manager.create(Bid, {
              auctionItemId: itemId,
              bidderId: prevWinnerId,
              amount: nextBid,
            });
            const savedAutoBid = await manager.save(Bid, autoBidEntity);
            item.currentPrice = nextBid;
            item.winnerId = prevWinnerId;
            await manager.save(AuctionItem, item);
            autoBid = { bidderId: prevWinnerId, amount: nextBid, bidId: savedAutoBid.id };
          }
        }
      }

      return { bid: savedBid, auctionId: item.auctionId, autoBid, closesAt: item.closesAt, binTriggered, prevWinnerId, cardName: item.cardName };
    });

    // Notify previous highest bidder that they were outbid (fire-and-forget)
    if (prevWinnerId && prevWinnerId !== bidderId) {
      const amountMxn = (dto.amount / 100).toFixed(0);
      this.notificationsService.sendToUser(prevWinnerId, {
        title: '¡Te superaron!',
        body: `Alguien pujó $${amountMxn} MXN por ${cardName}. Vuelve a pujar para no perderla.`,
        data: { type: 'outbid', auctionId, itemId },
      }).catch(() => {});
    }

    const bidder = await this.usersService.findById(bidderId);
    this.gateway.emitBidPlaced(auctionId, {
      auctionId,
      itemId,
      bidId: bid.id,
      bidderId,
      bidderUsername: bidder.username,
      amount: bid.amount,
      timestamp: bid.createdAt.toISOString(),
      closesAt: closesAt?.toISOString() ?? null,
    });

    if (autoBid) {
      const autoBidder = await this.usersService.findById(autoBid.bidderId);
      this.gateway.emitBidPlaced(auctionId, {
        auctionId,
        itemId,
        bidId: autoBid.bidId,
        bidderId: autoBid.bidderId,
        bidderUsername: autoBidder.username,
        amount: autoBid.amount,
        timestamp: new Date().toISOString(),
        closesAt: closesAt?.toISOString() ?? null,
      });
    }

    // BIN: trigger item close sequence after emitting the winning bid
    if (binTriggered) {
      const soldItem = await this.itemsRepo.findOne({ where: { id: itemId } });
      if (soldItem) await this.handleItemClosed(soldItem);
    }

    return bid;
  }

  async setMaxBid(itemId: string, userId: string, dto: SetMaxBidDto): Promise<void> {
    const item = await this.itemsRepo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Artículo no encontrado');
    if (item.status !== AuctionItemStatus.ACTIVE) {
      throw new BadRequestException('Este artículo no está activo en este momento');
    }
    if (dto.maxAmount <= item.currentPrice) {
      throw new BadRequestException(
        `Max bid must be greater than current price of ${item.currentPrice}`,
      );
    }

    // Sellers cannot place auto-bids on their own items
    const auction = await this.auctionsRepo.findOne({ where: { id: item.auctionId } });
    if (auction?.sellerId === userId) {
      throw new ForbiddenException('El vendedor no puede pujar en sus propios artículos');
    }

    await this.maxBidsRepo.upsert(
      { auctionItemId: itemId, userId, maxAmountCents: dto.maxAmount },
      { conflictPaths: ['auctionItemId', 'userId'] },
    );

    // If not currently winning, immediately auto-bid at the minimum increment
    if (item.winnerId !== userId) {
      await this.placeBid(itemId, userId, { amount: item.currentPrice + MIN_BID_INCREMENT });
    }
  }

  async cancelMaxBid(itemId: string, userId: string): Promise<void> {
    const deleted = await this.maxBidsRepo.delete({ auctionItemId: itemId, userId });
    if (!deleted.affected) throw new NotFoundException('No se encontró una puja automática activa para cancelar');
  }

  async closeItem(itemId: string, sellerId: string): Promise<AuctionItem> {
    const item = await this.itemsRepo.findOne({
      where: { id: itemId },
      relations: ['auction', 'bids'],
    });

    if (!item) throw new NotFoundException('Artículo no encontrado');
    this.assertOwner(item.auction.sellerId, sellerId);
    if (item.status !== AuctionItemStatus.ACTIVE) {
      throw new BadRequestException('El artículo no está activo');
    }
    if (item.bids && item.bids.length > 0) {
      throw new BadRequestException('No puedes cerrar un artículo que ya tiene pujas — espera a que termine el tiempo');
    }

    const newStatus = item.winnerId ? AuctionItemStatus.SOLD : AuctionItemStatus.UNSOLD;

    // Atomic status transition — prevents double-close if auto-close fires simultaneously
    const result = await this.itemsRepo
      .createQueryBuilder()
      .update(AuctionItem)
      .set({ status: newStatus })
      .where('id = :id AND status = :active', {
        id: item.id,
        active: AuctionItemStatus.ACTIVE,
      })
      .execute();

    if (result.affected === 0) {
      throw new BadRequestException('El artículo ya fue cerrado por otro proceso');
    }

    item.status = newStatus;
    await this.handleItemClosed(item);

    if (item.status === AuctionItemStatus.UNSOLD && item.autoRelist) {
      this.scheduleAutoRelist(item, item.auction.sellerId).catch(() => {});
    }

    return item;
  }

  private async handleItemClosed(item: AuctionItem): Promise<void> {
    const nextItem = await this.itemsRepo.findOne({
      where: { auctionId: item.auctionId, status: AuctionItemStatus.PENDING },
      order: { position: 'ASC' },
    });

    if (nextItem) {
      nextItem.status = AuctionItemStatus.ACTIVE;
      nextItem.closesAt = new Date(Date.now() + ITEM_TIMER_MS);
      await this.itemsRepo.save(nextItem);
    }

    if (item.winnerId) {
      const [auction, buyer] = await Promise.all([
        this.auctionsRepo.findOne({ where: { id: item.auctionId } }),
        this.usersService.findById(item.winnerId),
      ]);
      await this.ordersService.recordWin({
        auctionId: item.auctionId,
        sellerId: auction!.sellerId,
        buyerId: item.winnerId,
        buyerZip: buyer?.zipCode ?? null,
        auctionItemId: item.id,
        cardName: item.cardName,
        cardSet: item.cardSet,
        finalPrice: item.currentPrice,
        imageUrls: item.imageUrls,
      });
    }

    this.gateway.emitItemClosed(item.auctionId, {
      auctionId: item.auctionId,
      itemId: item.id,
      status: item.status,
      winnerId: item.winnerId ?? null,
      finalPrice: item.currentPrice,
      nextItemId: nextItem?.id ?? null,
      nextClosesAt: nextItem?.closesAt?.toISOString() ?? null,
    });
  }

  private async scheduleAutoRelist(item: AuctionItem, sellerId: string): Promise<void> {
    let target = await this.auctionsRepo.findOne({
      where: { sellerId, status: AuctionStatus.SCHEDULED },
      order: { createdAt: 'ASC' },
    });

    if (!target) {
      const sourceAuction = await this.auctionsRepo.findOne({ where: { id: item.auctionId } });
      const newAuction = this.auctionsRepo.create({
        sellerId,
        title: 'Auto-relist',
        game: sourceAuction?.game ?? AuctionGame.OTHER,
        status: AuctionStatus.SCHEDULED,
      });
      target = await this.auctionsRepo.save(newAuction);
    }

    const existing = await this.itemsRepo.find({ where: { auctionId: target.id }, order: { position: 'DESC' } });
    const nextPosition = (existing[0]?.position ?? -1) + 1;

    await this.itemsRepo.save(this.itemsRepo.create({
      auctionId:      target.id,
      cardName:       item.cardName,
      cardSet:        item.cardSet ?? undefined,
      cardNumber:     item.cardNumber ?? undefined,
      condition:      item.condition,
      startingPrice:  item.startingPrice,
      currentPrice:   item.startingPrice,
      reservePrice:   item.reservePrice ?? undefined,
      binPrice:       item.binPrice ?? undefined,
      imageUrls:      item.imageUrls ?? undefined,
      gradingCompany: item.gradingCompany ?? undefined,
      grade:          item.grade ?? undefined,
      position:       nextPosition,
      autoRelist:     false,
    }));
  }

  async addItem(auctionId: string, sellerId: string, dto: { cardName: string; startingPrice: number; imageUrls?: string[]; durationSeconds?: number; category?: string }): Promise<Auction> {
    const auction = await this.auctionsRepo.findOne({ where: { id: auctionId }, relations: ['items'] });
    if (!auction) throw new NotFoundException('Subasta no encontrada');
    if (auction.sellerId !== sellerId) throw new ForbiddenException();
    if (auction.status !== AuctionStatus.LIVE && auction.status !== AuctionStatus.SCHEDULED) {
      throw new BadRequestException('Solo puedes agregar cartas a subastas en vivo o próximas');
    }
    const position = auction.items.length;
    const isLive = auction.status === AuctionStatus.LIVE;
    const hasActiveItem = auction.items.some(i => i.status === AuctionItemStatus.ACTIVE);

    const durationMs = (dto.durationSeconds ?? 60) * 1000;
    const newStatus  = isLive && !hasActiveItem ? AuctionItemStatus.ACTIVE : AuctionItemStatus.PENDING;
    const closesAt   = newStatus === AuctionItemStatus.ACTIVE
      ? new Date(Date.now() + durationMs)
      : undefined;

    const savedItem = await this.itemsRepo.save(this.itemsRepo.create({
      auctionId,
      cardName:      dto.cardName,
      startingPrice: dto.startingPrice,
      currentPrice:  dto.startingPrice,
      imageUrls:     dto.imageUrls ?? [],
      position,
      status:        newStatus,
      closesAt,
      category:      dto.category ?? null,
    }));

    if (newStatus === AuctionItemStatus.ACTIVE && closesAt) {
      this.gateway.emitItemActivated(auctionId, {
        auctionId,
        itemId:        savedItem.id,
        cardName:      dto.cardName,
        startingPrice: dto.startingPrice,
        closesAt:      closesAt.toISOString(),
      });
    }

    return this.findOne(auctionId);
  }

  async getItemBids(itemId: string): Promise<Bid[]> {
    return this.bidsRepo.find({
      where: { auctionItemId: itemId },
      relations: ['bidder'],
      order: { createdAt: 'DESC' },
      take: 50, // cap to last 50 bids — sufficient for UI display
    });
  }

  async getMyBids(userId: string) {
    const bids = await this.bidsRepo.find({
      where: { bidderId: userId },
      relations: ['auctionItem', 'auctionItem.auction'],
      order: { createdAt: 'DESC' },
      take: 500, // cap to most recent 500 bids; adequate for the UI
    });

    // One entry per item — keep highest bid
    const seen = new Map<string, typeof bids[0]>();
    for (const bid of bids) {
      if (!bid.auctionItem) continue;
      const prev = seen.get(bid.auctionItemId);
      if (!prev || bid.amount > prev.amount) seen.set(bid.auctionItemId, bid);
    }

    return Array.from(seen.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(bid => ({
        auctionItemId: bid.auctionItemId,
        myTopBid: bid.amount,
        lastBidAt: bid.createdAt,
        item: bid.auctionItem,
        auction: bid.auctionItem.auction,
      }));
  }

  async relist(id: string, sellerId: string): Promise<Auction> {
    const source = await this.findOne(id);
    this.assertOwner(source.sellerId, sellerId);
    if (source.status !== AuctionStatus.ENDED) {
      throw new BadRequestException('Solo puedes volver a listar subastas terminadas');
    }

    const unsold = source.items.filter(i => i.status === AuctionItemStatus.UNSOLD);
    if (!unsold.length) {
      throw new BadRequestException('No hay items no vendidos en esta subasta');
    }

    const newAuction = this.auctionsRepo.create({
      sellerId,
      title: source.title,
      game: source.game,
      description: source.description ?? undefined,
      items: unsold.map((item, index) =>
        this.itemsRepo.create({
          cardName:       item.cardName,
          cardSet:        item.cardSet ?? undefined,
          cardNumber:     item.cardNumber ?? undefined,
          condition:      item.condition,
          startingPrice:  item.startingPrice,
          currentPrice:   item.startingPrice,
          reservePrice:   item.reservePrice ?? undefined,
          binPrice:       item.binPrice ?? undefined,
          gradingCompany: item.gradingCompany ?? undefined,
          grade:          item.grade ?? undefined,
          imageUrls:      item.imageUrls ?? undefined,
          position:       index,
        }),
      ),
    });

    return this.auctionsRepo.save(newAuction);
  }

  private assertOwner(ownerId: string, requesterId: string): void {
    if (ownerId !== requesterId) throw new ForbiddenException();
  }
}
