import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FollowsService } from './follows.service';

@UseGuards(AuthGuard('jwt'))
@Controller('follows')
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  @Post(':sellerId')
  async follow(@Param('sellerId') sellerId: string, @CurrentUser('id') userId: string) {
    await this.followsService.follow(userId, sellerId);
    return { following: true };
  }

  @Delete(':sellerId')
  async unfollow(@Param('sellerId') sellerId: string, @CurrentUser('id') userId: string) {
    await this.followsService.unfollow(userId, sellerId);
    return { following: false };
  }

  @Get(':sellerId/status')
  async status(@Param('sellerId') sellerId: string, @CurrentUser('id') userId: string) {
    return { following: await this.followsService.isFollowing(userId, sellerId) };
  }
}
