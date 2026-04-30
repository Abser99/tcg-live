import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WatchlistService } from './watchlist.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@Controller('watchlist')
@UseGuards(AuthGuard('jwt'))
export class WatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  @Post(':auctionId')
  add(@CurrentUser() user: User, @Param('auctionId') auctionId: string) {
    return this.watchlistService.add(user.id, auctionId);
  }

  @Delete(':auctionId')
  remove(@CurrentUser() user: User, @Param('auctionId') auctionId: string) {
    return this.watchlistService.remove(user.id, auctionId);
  }

  @Get()
  findMine(@CurrentUser() user: User) {
    return this.watchlistService.findByUser(user.id);
  }

  @Get(':auctionId/status')
  async status(@CurrentUser() user: User, @Param('auctionId') auctionId: string) {
    const watching = await this.watchlistService.isWatching(user.id, auctionId);
    return { watching };
  }
}
