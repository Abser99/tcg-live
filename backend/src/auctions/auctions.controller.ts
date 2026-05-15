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
export class AuctionsController {
  constructor(
    private readonly auctionsService: AuctionsService,
    private readonly livekitService: LivekitService,
  ) {}

  // --- Public endpoints (no auth required) ---

  @Get()
  findAll(
    @Query('q') q?: string,
    @Query('game') game?: string,
    @Query('condition') condition?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
  ) {
    return this.auctionsService.findAll({
      query: q,
      game,
      condition,
      minPrice: minPrice ? parseInt(minPrice, 10) : undefined,
      maxPrice: maxPrice ? parseInt(maxPrice, 10) : undefined,
    });
  }

  @Get('seller/:sellerId')
  findBySeller(@Param('sellerId') sellerId: string) {
    return this.auctionsService.findBySeller(sellerId);
  }

  @Get('items/:itemId/bids')
  getItemBids(@Param('itemId') itemId: string) {
    return this.auctionsService.getItemBids(itemId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.auctionsService.findOne(id);
  }

  // --- Authenticated endpoints ---

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  create(@CurrentUser() user: User, @Body() dto: CreateAuctionDto) {
    return this.auctionsService.create(user.id, dto);
  }

  @Get('my')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  findMy(@CurrentUser() user: User) {
    return this.auctionsService.findMy(user.id);
  }

  @Get('my-bids')
  @UseGuards(AuthGuard('jwt'))
  getMyBids(@CurrentUser() user: User) {
    return this.auctionsService.getMyBids(user.id);
  }

  @Get(':id/livekit-token')
  @UseGuards(AuthGuard('jwt'))
  async getLivekitToken(@Param('id') id: string, @CurrentUser() user: User) {
    const auction = await this.auctionsService.findOne(id);
    const canPublish = auction.sellerId === user.id;
    const token = await this.livekitService.generateToken(user.id, user.username, id, canPublish);
    return { token, wsUrl: this.livekitService.wsUrl };
  }

  @Patch(':id/start')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  start(@Param('id') id: string, @CurrentUser() user: User) {
    return this.auctionsService.start(id, user.id);
  }

  @Patch(':id/end')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  end(@Param('id') id: string, @CurrentUser() user: User) {
    return this.auctionsService.end(id, user.id);
  }

  @Post(':id/relist')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  relist(@Param('id') id: string, @CurrentUser() user: User) {
    return this.auctionsService.relist(id, user.id);
  }

  @Post('items/:itemId/bids')
  @UseGuards(AuthGuard('jwt'))
  placeBid(
    @Param('itemId') itemId: string,
    @CurrentUser() user: User,
    @Body() dto: PlaceBidDto,
  ) {
    return this.auctionsService.placeBid(itemId, user.id, dto);
  }

  @Patch('items/:itemId/close')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  closeItem(@Param('itemId') itemId: string, @CurrentUser() user: User) {
    return this.auctionsService.closeItem(itemId, user.id);
  }

  @Post('items/:itemId/max-bid')
  @UseGuards(AuthGuard('jwt'))
  setMaxBid(
    @Param('itemId') itemId: string,
    @CurrentUser() user: User,
    @Body() dto: SetMaxBidDto,
  ) {
    return this.auctionsService.setMaxBid(itemId, user.id, dto);
  }
}
