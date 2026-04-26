import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuctionsService } from './auctions.service';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { PlaceBidDto } from './dto/place-bid.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/user.entity';

@Controller('auctions')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AuctionsController {
  constructor(private readonly auctionsService: AuctionsService) {}

  @Post()
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  create(@CurrentUser() user: User, @Body() dto: CreateAuctionDto) {
    return this.auctionsService.create(user.id, dto);
  }

  @Get()
  findAll() {
    return this.auctionsService.findAll();
  }

  @Get('my')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  findMy(@CurrentUser() user: User) {
    return this.auctionsService.findMy(user.id);
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

  @Get('items/:itemId/bids')
  getItemBids(@Param('itemId') itemId: string) {
    return this.auctionsService.getItemBids(itemId);
  }
}
