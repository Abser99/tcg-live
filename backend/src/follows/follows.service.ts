import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FollowedSeller } from './entities/followed-seller.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class FollowsService {
  constructor(
    @InjectRepository(FollowedSeller)
    private readonly repo: Repository<FollowedSeller>,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  async follow(userId: string, sellerId: string): Promise<void> {
    await this.repo.upsert({ userId, sellerId }, { conflictPaths: ['userId', 'sellerId'] });
  }

  async unfollow(userId: string, sellerId: string): Promise<void> {
    await this.repo.delete({ userId, sellerId });
  }

  async isFollowing(userId: string, sellerId: string): Promise<boolean> {
    return !!(await this.repo.findOne({ where: { userId, sellerId } }));
  }

  /** Sellers this user follows. Returns usernames too so the UI can match its cards. */
  async myFollows(userId: string): Promise<{ sellerId: string; username: string }[]> {
    const rows = await this.repo.find({ where: { userId } });
    if (!rows.length) return [];
    const out = await Promise.all(
      rows.map(async r => {
        // A seller could have been deleted; skip those rather than failing the list.
        const seller = await this.usersService.findById(r.sellerId).catch(() => null);
        return seller ? { sellerId: r.sellerId, username: seller.username } : null;
      }),
    );
    return out.filter((x): x is { sellerId: string; username: string } => x !== null);
  }

  /** Tell this seller's followers their stream starts shortly. */
  async notifyFollowersLiveSoon(
    sellerId: string, auctionTitle: string, auctionId: string, minutes: number,
  ): Promise<void> {
    const follows = await this.repo.find({ where: { sellerId } });
    if (!follows.length) return;
    const seller = await this.usersService.findById(sellerId);
    await Promise.allSettled(
      follows.map(f =>
        this.notificationsService.notifySellerLiveSoon(
          f.userId, seller.username, auctionTitle, auctionId, minutes,
        ),
      ),
    );
  }

  async notifyFollowers(sellerId: string, auctionTitle: string, auctionId: string): Promise<void> {
    const follows = await this.repo.find({ where: { sellerId } });
    if (!follows.length) return;
    const seller = await this.usersService.findById(sellerId);
    await Promise.allSettled(
      follows.map(f =>
        this.notificationsService.notifySellerGoingLive(f.userId, seller.username, auctionTitle, auctionId),
      ),
    );
  }
}
