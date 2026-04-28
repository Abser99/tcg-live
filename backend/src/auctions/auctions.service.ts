import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Auction, AuctionStatus } from './entities/auction.entity';
import { AuctionItem, AuctionItemStatus } from './entities/auction-item.entity';
import { Bid } from './entities/bid.entity';
import { MaxBid } from './entities/max-bid.entity';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { PlaceBidDto } from './dto/place-bid.dto';
import { SetMaxBidDto } from './dto/set-max-bid.dto';
import { AuctionsGateway } from './auctions.gateway';
import { UsersService } from '../users/users.service';
import { OrdersService } from '../orders/orders.service';

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
  ) {}

  async create(sellerId: string, dto: CreateAuctionDto): Promise<Auction> {
    const auction = this.auctionsRepo.create({
      sellerId,
      title: dto.title,
      game: dto.game,
      description: dto.description,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      items: (dto.items ?? []).map((item, index) =>
        this.itemsRepo.create({ ...item, position: index, currentPrice: item.startingPrice }),
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

  async findAll(query?: string, game?: string): Promise<Auction[]> {
    const qb = this.auctionsRepo.createQueryBuilder('a')
      .leftJoinAndSelect('a.seller', 'seller')
      .leftJoinAndSelect('a.items', 'items')
      .where('a.status IN (:...statuses)', { statuses: [AuctionStatus.SCHEDULED, AuctionStatus.LIVE] });

    if (query?.trim()) {
      qb.andWhere('LOWER(a.title) LIKE :q', { q: `%${query.toLowerCase().trim()}%` });
    }
    if (game?.trim()) {
      qb.andWhere('a.game = :game', { game: game.trim() });
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
    const { bid, auctionId, autoBid, closesAt } = await this.dataSource.transaction(async (manager) => {
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
      // Anti-snipe: extend timer if bid lands in last 10 seconds
      if (item.closesAt) {
        const msLeft = item.closesAt.getTime() - Date.now();
        if (msLeft < ANTI_SNIPE_MS) {
          item.closesAt = new Date(Date.now() + ANTI_SNIPE_MS);
        }
      }
      await manager.save(AuctionItem, item);

      const newBid = manager.create(Bid, { auctionItemId: itemId, bidderId, amount: dto.amount });
      const savedBid = await manager.save(Bid, newBid);

      // Auto-bid: if the displaced winner has a max bid that can still outbid
      let autoBid: { bidderId: string; amount: number; bidId: string } | null = null;
      if (prevWinnerId && prevWinnerId !== bidderId) {
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

      return { bid: savedBid, auctionId: item.auctionId, autoBid, closesAt: item.closesAt };
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

    const nextItem = await this.itemsRepo.findOne({
      where: { auctionId: item.auctionId, status: AuctionItemStatus.PENDING },
      order: { position: 'ASC' },
    });

    if (nextItem) {
      nextItem.status = AuctionItemStatus.ACTIVE;
      nextItem.closesAt = new Date(Date.now() + ITEM_TIMER_MS);
      await this.itemsRepo.save(nextItem);
    }

    const saved = await this.itemsRepo.save(item);

    if (saved.winnerId) {
      const [auction, buyer] = await Promise.all([
        this.auctionsRepo.findOne({ where: { id: item.auctionId } }),
        this.usersService.findById(saved.winnerId),
      ]);
      await this.ordersService.recordWin({
        auctionId: item.auctionId,
        sellerId: auction!.sellerId,
        buyerId: saved.winnerId,
        buyerZip: buyer?.zipCode ?? null,
        auctionItemId: itemId,
        cardName: saved.cardName,
        cardSet: saved.cardSet,
        finalPrice: saved.currentPrice,
        imageUrls: saved.imageUrls,
      });
    }

    this.gateway.emitItemClosed(item.auctionId, {
      auctionId: item.auctionId,
      itemId,
      status: saved.status,
      winnerId: saved.winnerId,
      finalPrice: saved.currentPrice,
      nextItemId: nextItem?.id ?? null,
      nextClosesAt: nextItem?.closesAt?.toISOString() ?? null,
    });

    return saved;
  }

  async getItemBids(itemId: string): Promise<Bid[]> {
    return this.bidsRepo.find({
      where: { auctionItemId: itemId },
      relations: ['bidder'],
      order: { createdAt: 'DESC' },
    });
  }

  private assertOwner(ownerId: string, requesterId: string): void {
    if (ownerId !== requesterId) throw new ForbiddenException();
  }
}
