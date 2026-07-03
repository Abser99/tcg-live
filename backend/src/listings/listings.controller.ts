import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateListingDto } from './dto/create-listing.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { ListingsService } from './listings.service';

@Controller('listings')
export class ListingsController {
  constructor(private readonly service: ListingsService) {}

  @Get()
  findAll(@Query('game') game?: string, @Query('q') q?: string) {
    return this.service.findAll(game, q);
  }

  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  myListings(@Request() req: any) {
    return this.service.myListings(req.user.id);
  }

  @Get('offers/mine')
  @UseGuards(AuthGuard('jwt'))
  myOffers(@Request() req: any) {
    return this.service.getMyOffers(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Body() dto: CreateListingDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Patch(':id/sold')
  @UseGuards(AuthGuard('jwt'))
  markSold(@Param('id') id: string, @Request() req: any) {
    return this.service.markSold(id, req.user.id);
  }

  @Post(':id/buy')
  @UseGuards(AuthGuard('jwt'))
  buy(@Param('id') id: string, @Request() req: any) {
    return this.service.buy(id, req.user.id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.service.cancel(id, req.user.id);
  }

  // ── Offers ──

  @Post(':id/offers')
  @UseGuards(AuthGuard('jwt'))
  createOffer(@Param('id') id: string, @Body() dto: CreateOfferDto, @Request() req: any) {
    return this.service.createOffer(id, req.user.id, dto);
  }

  @Get(':id/offers')
  @UseGuards(AuthGuard('jwt'))
  getOffers(@Param('id') id: string, @Request() req: any) {
    return this.service.getOffersForListing(id, req.user.id);
  }

  @Patch(':id/offers/:offerId/accept')
  @UseGuards(AuthGuard('jwt'))
  acceptOffer(@Param('id') _id: string, @Param('offerId') offerId: string, @Request() req: any) {
    return this.service.respondToOffer(offerId, req.user.id, true);
  }

  @Patch(':id/offers/:offerId/decline')
  @UseGuards(AuthGuard('jwt'))
  declineOffer(@Param('id') _id: string, @Param('offerId') offerId: string, @Request() req: any) {
    return this.service.respondToOffer(offerId, req.user.id, false);
  }

  @Delete(':id/offers/:offerId')
  @HttpCode(204)
  @UseGuards(AuthGuard('jwt'))
  withdrawOffer(@Param('id') _id: string, @Param('offerId') offerId: string, @Request() req: any) {
    return this.service.withdrawOffer(offerId, req.user.id);
  }
}
