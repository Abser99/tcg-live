import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuctionsService } from './auctions.service';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { PlaceBidDto } from './dto/place-bid.dto';
import { SetMaxBidDto } from './dto/set-max-bid.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/user.entity';
import { LivekitService } from '../livekit/livekit.service';

@Controller('auctions')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AuctionsController {
  constructor(
    private readonly auctionsService: AuctionsService,
    private readonly livekitService: LivekitService,
  ) {}

  @Post()
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  create(@CurrentUser() user: User, @Body() dto: CreateAuctionDto) {
    return this.auctionsService.create(user.id, dto);
  }

  @Get()
  findAll(@Query('q') q?: string, @Query('game') game?: string) {
    return this.auctionsService.findAll(q, game);
  }

  @Get('my')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  findMy(@CurrentUser() user: User) {
    return this.auctionsService.findMy(user.id);
  }

  @Get('seller/:sellerId')
  findBySeller(@Param('sellerId') sellerId: string) {
    return this.auctionsService.findBySeller(sellerId);
  }

  @Get('my-bids')
  getMyBids(@CurrentUser() user: User) {
    return this.auctionsService.getMyBids(user.id);
  }

  @Get(':id/livekit-token')
  async getLivekitToken(@Param('id') id: string, @CurrentUser() user: User) {
    const auction = await this.auctionsService.findOne(id);
    const canPublish = auction.sellerId === user.id;
    const token = await this.livekitService.generateToken(user.id, user.username, id, canPublish);
    return { token, wsUrl: this.livekitService.wsUrl };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.auctionsService.findOne(id);
  }

  @Patch(':id/start')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  start(@Param('id') id: string, @CurrentUser() user: User) {
    return this.auctionsService.start(id, user.id);
  }

  @Patch(':id/end')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  end(@Param('id') id: string, @CurrentUser() user: User) {
    return this.auctionsService.end(id, user.id);
  }

  @Post(':id/relist')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  relist(@Param('id') id: string, @CurrentUser() user: User) {
    return this.auctionsService.relist(id, user.id);
  }

  @Post('items/:itemId/bids')
  placeBid(
    @Param('itemId') itemId: string,
    @CurrentUser() user: User,
    @Body() dto: PlaceBidDto,
  ) {
    return this.auctionsService.placeBid(itemId, user.id, dto);
  }

  @Patch('items/:itemId/close')
  closeItem(@Param('itemId') itemId: string, @CurrentUser() user: User) {
    return this.auctionsService.closeItem(itemId, user.id);
  }

  @Post('items/:itemId/max-bid')
  setMaxBid(
    @Param('itemId') itemId: string,
    @CurrentUser() user: User,
    @Body() dto: SetMaxBidDto,
  ) {
    return this.auctionsService.setMaxBid(itemId, user.id, dto);
  }

  @Get('items/:itemId/bids')
  getItemBids(@Param('itemId') itemId: string) {
    return this.auctionsService.getItemBids(itemId);
  }
}
