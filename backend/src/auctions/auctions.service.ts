import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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

const MIN_BID_INCREMENT = 100; // 1 MXN in cents
const ITEM_TIMER_MS = 60_000;   // 60s per item
const ANTI_SNIPE_MS = 10_000;   // extend if bid within last 10s

@Injectable()
export class AuctionsService {
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
  ) {}

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
  } = {}): Promise<Auction[]> {
    const { query, game, condition, minPrice, maxPrice } = params;

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

    return qb.orderBy('a.status', 'DESC').addOrderBy('a.scheduledAt', 'ASC').getMany();
  }

  async findOne(id: string): Promise<Auction> {
    const auction = await this.auctionsRepo.findOne({
      where: { id },
      relations: ['seller', 'items'],
    });
    if (!auction) throw new NotFoundException('Auction not found');
    return auction;
  }

  async start(id: string, sellerId: string): Promise<Auction> {
    const auction = await this.findOne(id);
    this.assertOwner(auction.sellerId, sellerId);
    if (auction.status !== AuctionStatus.SCHEDULED) {
      throw new BadRequestException('Auction is not in scheduled state');
    }

    auction.status = AuctionStatus.LIVE;
    auction.startedAt = new Date();

    const firstItem = [...auction.items].sort((a, b) => a.position - b.position)[0];
    if (firstItem) {
      firstItem.status = AuctionItemStatus.ACTIVE;
      firstItem.closesAt = new Date(Date.now() + ITEM_TIMER_MS);
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
      throw new BadRequestException('Auction is not live');
    }

    auction.status = AuctionStatus.ENDED;
    auction.endedAt = new Date();
    const saved = await this.auctionsRepo.save(auction);

    this.gateway.emitAuctionEnded(id);

    return saved;
  }

  async placeBid(itemId: string, bidderId: string, dto: PlaceBidDto): Promise<Bid> {
    const { bid, auctionId, autoBid, closesAt, binTriggered } = await this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(AuctionItem, {
        where: { id: itemId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!item) throw new NotFoundException('Item not found');
      if (item.status !== AuctionItemStatus.ACTIVE) {
        throw new BadRequestException('Item is not currently active');
      }

      const auction = await manager.findOne(Auction, { where: { id: item.auctionId } });
      if (auction!.status !== AuctionStatus.LIVE) {
        throw new BadRequestException('Auction is not live');
      }
      if (auction!.sellerId === bidderId) {
        throw new ForbiddenException('Seller cannot bid on their own items');
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

      return { bid: savedBid, auctionId: item.auctionId, autoBid, closesAt: item.closesAt, binTriggered };
    });

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
    if (!item) throw new NotFoundException('Item not found');
    if (item.status !== AuctionItemStatus.ACTIVE) {
      throw new BadRequestException('Item is not currently active');
    }
    if (dto.maxAmount <= item.currentPrice) {
      throw new BadRequestException(
        `Max bid must be greater than current price of ${item.currentPrice}`,
      );
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

  async closeItem(itemId: string, sellerId: string): Promise<AuctionItem> {
    const item = await this.itemsRepo.findOne({
      where: { id: itemId },
      relations: ['auction'],
    });

    if (!item) throw new NotFoundException('Item not found');
    this.assertOwner(item.auction.sellerId, sellerId);
    if (item.status !== AuctionItemStatus.ACTIVE) {
      throw new BadRequestException('Item is not active');
    }

    item.status = item.winnerId ? AuctionItemStatus.SOLD : AuctionItemStatus.UNSOLD;
    const saved = await this.itemsRepo.save(item);

    await this.handleItemClosed(saved);

    if (saved.status === AuctionItemStatus.UNSOLD && saved.autoRelist) {
      this.scheduleAutoRelist(saved, item.auction.sellerId).catch(() => {});
    }

    return saved;
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

  async getItemBids(itemId: string): Promise<Bid[]> {
    return this.bidsRepo.find({
      where: { auctionItemId: itemId },
      relations: ['bidder'],
      order: { createdAt: 'DESC' },
    });
  }

  async getMyBids(userId: string) {
    const bids = await this.bidsRepo.find({
      where: { bidderId: userId },
      relations: ['auctionItem', 'auctionItem.auction'],
      order: { createdAt: 'DESC' },
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
