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
