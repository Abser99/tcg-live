import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { AuctionsService } from './auctions.service';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { PlaceBidDto } from './dto/place-bid.dto';
import { SetMaxBidDto } from './dto/set-max-bid.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/user.entity';
import { LivekitService } from '../livekit/livekit.service';
import { AuctionGame } from './entities/auction.entity';

class UpdateAuctionDto {
  @IsString() @IsOptional() @MaxLength(120) title?: string;
  @IsEnum(AuctionGame) @IsOptional() game?: AuctionGame;
}

class AddItemDto {
  @IsString()
  @MaxLength(120)
  cardName: string;

  @IsInt()
  @Min(1)
  @Max(100_000_000)
  startingPrice: number; // MXN cents

  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  imageUrls?: string[];

  @IsInt()
  @Min(10)
  @Max(3600)
  @IsOptional()
  durationSeconds?: number;

  @IsString()
  @MaxLength(40)
  @IsOptional()
  category?: string;
}

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
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auctionsService.findAll({
      query: q,
      game,
      condition,
      minPrice: minPrice ? parseInt(minPrice, 10) : undefined,
      maxPrice: maxPrice ? parseInt(maxPrice, 10) : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('seller/:sellerId')
  findBySeller(@Param('sellerId') sellerId: string) {
    return this.auctionsService.findBySeller(sellerId);
  }

  @Get('items/:itemId/bids')
  @UseGuards(AuthGuard('jwt'))
  getItemBids(@Param('itemId') itemId: string) {
    return this.auctionsService.getItemBids(itemId);
  }

  // --- Authenticated endpoints (must come before :id to avoid route shadowing) ---

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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.auctionsService.findOne(id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  create(@CurrentUser() user: User, @Body() dto: CreateAuctionDto) {
    return this.auctionsService.create(user.id, dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  update(@Param('id') id: string, @CurrentUser() user: User, @Body() dto: UpdateAuctionDto) {
    return this.auctionsService.update(id, user.id, dto);
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

  @Post(':id/items')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  addItem(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: AddItemDto,
  ) {
    return this.auctionsService.addItem(id, user.id, body);
  }

  @Post('items/:itemId/bids')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 10, ttl: 10000 } })
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

  @Delete('items/:itemId/max-bid')
  @UseGuards(AuthGuard('jwt'))
  cancelMaxBid(@Param('itemId') itemId: string, @CurrentUser() user: User) {
    return this.auctionsService.cancelMaxBid(itemId, user.id);
  }
}
