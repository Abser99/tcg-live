import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './users/user.entity';
import { Auction } from './auctions/entities/auction.entity';
import { Bid } from './auctions/entities/bid.entity';

@Controller()
export class HealthController {
  constructor(
    @InjectRepository(User)    private readonly usersRepo:    Repository<User>,
    @InjectRepository(Auction) private readonly auctionsRepo: Repository<Auction>,
    @InjectRepository(Bid)     private readonly bidsRepo:     Repository<Bid>,
  ) {}

  @Get()
  health() {
    return { status: 'ok' };
  }

  @Get('stats')
  async stats() {
    const [totalUsers, totalAuctions, totalBids] = await Promise.all([
      this.usersRepo.count(),
      this.auctionsRepo.count(),
      this.bidsRepo.count(),
    ]);
    return { totalUsers, totalAuctions, totalBids };
  }
}
