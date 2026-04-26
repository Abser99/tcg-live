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
import { CreateAuctionDto } from './dto/create-auction.dto';
import { PlaceBidDto } from './dto/place-bid.dto';
import { AuctionsGateway } from './auctions.gateway';

@Injectable()
export class AuctionsService {
  constructor(
    @InjectRepository(Auction)
    private readonly auctionsRepo: Repository<Auction>,
    @InjectRepository(AuctionItem)
    private readonly itemsRepo: Repository<AuctionItem>,
    @InjectRepository(Bid)
    private readonly bidsRepo: Repository<Bid>,
    private readonly dataSource: DataSource,
    private readonly gateway: AuctionsGateway,
  ) {}

  async create(sellerId: string, dto: CreateAuctionDto): Promise<Auction> {
    const auction = this.auctionsRepo.create({
      sellerId,
      title: dto.title,
      description: dto.description,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      items: (dto.items ?? []).map((item, index) =>
        this.itemsRepo.create({ ...item, position: index, currentPrice: item.startingPrice }),
      ),
    });
    return this.auctionsRepo.save(auction);
  }

  async findAll(): Promise<Auction[]> {
    return this.auctionsRepo.find({
      where: [{ status: AuctionStatus.SCHEDULED }, { status: AuctionStatus.LIVE }],
      relations: ['seller'],
      order: { scheduledAt: 'ASC' },
    });
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
    if (auction.sellerId !== sellerId) throw new ForbiddenException();
    if (auction.status !== AuctionStatus.SCHEDULED) {
      throw new BadRequestException('Auction is not in scheduled state');
    }

    auction.status = AuctionStatus.LIVE;
    auction.startedAt = new Date();

    const firstItem = auction.items.sort((a, b) => a.position - b.position)[0];
    if (firstItem) {
      firstItem.status = AuctionItemStatus.ACTIVE;
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
    if (auction.sellerId !== sellerId) throw new ForbiddenException();
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
    const bid = await this.dataSource.transaction(async (manager) => {
      // Lock only the item row — no joins (PostgreSQL rejects FOR UPDATE on nullable join sides)
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

      item.currentPrice = dto.amount;
      item.winnerId = bidderId;
      await manager.save(AuctionItem, item);

      const newBid = manager.create(Bid, { auctionItemId: itemId, bidderId, amount: dto.amount });
      return manager.save(Bid, newBid);
    });

    // load bidder username for the broadcast
    const bidWithBidder = await this.bidsRepo.findOne({
      where: { id: bid.id },
      relations: ['bidder', 'auctionItem'],
    });

    this.gateway.emitBidPlaced(bidWithBidder!.auctionItem.auctionId, {
      auctionId: bidWithBidder!.auctionItem.auctionId,
      itemId,
      bidId: bid.id,
      bidderId,
      bidderUsername: bidWithBidder!.bidder.username,
      amount: dto.amount,
      timestamp: bid.createdAt.toISOString(),
    });

    return bid;
  }

  async closeItem(itemId: string, sellerId: string): Promise<AuctionItem> {
    const item = await this.itemsRepo.findOne({
      where: { id: itemId },
      relations: ['auction'],
    });

    if (!item) throw new NotFoundException('Item not found');
    if (item.auction.sellerId !== sellerId) throw new ForbiddenException();
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
      await this.itemsRepo.save(nextItem);
    }

    const saved = await this.itemsRepo.save(item);

    this.gateway.emitItemClosed(item.auctionId, {
      auctionId: item.auctionId,
      itemId,
      status: saved.status,
      winnerId: saved.winnerId,
      finalPrice: saved.currentPrice,
      nextItemId: nextItem?.id ?? null,
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
}
