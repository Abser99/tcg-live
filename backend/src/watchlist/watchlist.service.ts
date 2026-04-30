import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WatchlistItem } from './entities/watchlist-item.entity';
import { Auction, AuctionStatus } from '../auctions/entities/auction.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class WatchlistService {
  constructor(
    @InjectRepository(WatchlistItem)
    private readonly repo: Repository<WatchlistItem>,
    @InjectRepository(Auction)
    private readonly auctionsRepo: Repository<Auction>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async add(userId: string, auctionId: string): Promise<WatchlistItem> {
    const auction = await this.auctionsRepo.findOne({ where: { id: auctionId } });
    if (!auction) throw new BadRequestException('Subasta no encontrada');
    if (auction.status === AuctionStatus.ENDED || auction.status === AuctionStatus.CANCELLED) {
      throw new BadRequestException('No puedes guardar una subasta que ya terminó');
    }

    const existing = await this.repo.findOne({ where: { userId, auctionId } });
    if (existing) return existing;

    return this.repo.save(this.repo.create({ userId, auctionId }));
  }

  async remove(userId: string, auctionId: string): Promise<void> {
    await this.repo.delete({ userId, auctionId });
  }

  async findByUser(userId: string): Promise<Auction[]> {
    const items = await this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    if (!items.length) return [];
    const auctionIds = items.map(i => i.auctionId);
    return this.auctionsRepo.find({
      where: { id: In(auctionIds) },
      relations: ['seller', 'items'],
    });
  }

  async isWatching(userId: string, auctionId: string): Promise<boolean> {
    const item = await this.repo.findOne({ where: { userId, auctionId } });
    return !!item;
  }

  /** Called by AuctionsService when an auction goes live */
  async notifyWatchers(auctionId: string, auctionTitle: string): Promise<void> {
    const items = await this.repo.find({ where: { auctionId } });
    await Promise.allSettled(
      items.map(item =>
        this.notificationsService.notifyAuctionGoingLive(item.userId, auctionTitle, auctionId),
      ),
    );
  }
}
