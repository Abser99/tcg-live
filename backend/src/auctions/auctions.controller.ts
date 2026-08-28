import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { unlink } from 'fs/promises';
import { Throttle } from '@nestjs/throttler';
import { IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { AuctionsService } from './auctions.service';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { PlaceBidDto } from './dto/place-bid.dto';
import { SetMaxBidDto } from './dto/set-max-bid.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/user.entity';
import { LivekitService } from '../livekit/livekit.service';
import { AuctionGame, BidMode } from './entities/auction.entity';
import { SanctionKind } from './entities/live-sanction.entity';

class ModeratorDto {
  @IsString() userId: string;
  @IsIn(['add', 'remove']) action: 'add' | 'remove';
}

class SanctionDto {
  @IsString() targetUserId: string;
  @IsString() targetUsername: string;
  @IsEnum(SanctionKind) kind: SanctionKind;
  @IsInt() @Min(1) @Max(24) @IsOptional() hours?: number; // omit for a permanent ban
}

class UpdateAuctionDto {
  @IsString() @IsOptional() @MaxLength(120) title?: string;
  @IsEnum(AuctionGame) @IsOptional() game?: AuctionGame;
  @IsArray() @IsString({ each: true }) @IsOptional() reactionEmojis?: string[];
  @IsEnum(BidMode) @IsOptional() bidMode?: BidMode;
  @IsInt() @Min(0) @Max(100_000_000) @IsOptional() dutchFloorCents?: number;

  /** Rename the show. The lot numbers stay automatic. */
  @IsString() @MaxLength(80) @IsOptional() displayName?: string;
}

class SetTimerDto {
  @IsInt() @Min(10) @Max(600) seconds: number; // 10s – 10 min
}

class AddItemDto {
  /** Ignored — the server assigns the lot number (`Puja0001-08-2026`). */
  @IsString()
  @MaxLength(120)
  @IsOptional()
  cardName?: string;

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
  @Max(600)
  @IsOptional()
  durationSeconds?: number; // 10s – 10 min (matches the seller's picker)

  @IsString()
  @MaxLength(40)
  @IsOptional()
  category?: string;
}

class CreateRaffleDto {
  @IsString() @MaxLength(120) prizeTitle: string;
  /** Catalogue item to hand over, so the winner gets a trackable order. */
  @IsString() @IsOptional() prizeListingId?: string;
  /** Minutes of watch time required to qualify. */
  @IsInt() @Min(0) @Max(600) @IsOptional() minMinutes?: number;
  /** Path returned by POST :id/raffle-image. The service rejects anything else. */
  @IsString() @MaxLength(300) @IsOptional() prizeImageUrl?: string;
}

class AwardGiveawayDto {
  @IsString() @MaxLength(40) winnerUsername: string;
  /** Prize from the seller's buy-now catalogue. Omitted = announcement only. */
  @IsString() @IsOptional() listingId?: string;
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

  /**
   * Store a recording the seller's browser captured for this live.
   *
   * LiveKit Cloud egress renders in LiveKit's cloud, so it can only write to a cloud
   * bucket — never to this machine. Recording in the browser and posting the file here
   * is what makes a purely local setup (no bucket, no Docker) able to keep video.
   */
  @Post(':id/recording')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads/recordings',
      filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${extname(file.originalname) || '.webm'}`);
      },
    }),
    fileFilter: (_req, file, cb) =>
      file.mimetype.startsWith('video/')
        ? cb(null, true)
        : cb(new BadRequestException('Solo se aceptan archivos de video'), false),
    limits: { fileSize: 512 * 1024 * 1024 }, // a long session is still just one file
  }))
  uploadRecording(
    @Param('id') id: string,
    @UploadedFile() file: { filename: string } | undefined,
    @Body('startedAt') startedAt: string | undefined,
    @CurrentUser() user: User,
  ) {
    if (!file) throw new BadRequestException('No se recibió el archivo');
    return this.auctionsService.attachRecording(
      id, user.id, `/uploads/recordings/${file.filename}`, startedAt,
    );
  }

  /** "I'm still watching." Credits time toward raffle entries. */
  @Post(':id/heartbeat')
  @UseGuards(AuthGuard('jwt'))
  heartbeat(@Param('id') id: string, @Query('ref') ref: string | undefined, @CurrentUser() user: User) {
    return this.auctionsService.heartbeat(id, user.id, ref);
  }

  /** How long the current viewer has watched this live. */
  @Get(':id/watch-time')
  @UseGuards(AuthGuard('jwt'))
  watchTime(@Param('id') id: string, @CurrentUser() user: User) {
    return this.auctionsService.myWatchTime(id, user.id);
  }

  /** Raffles on this live — anyone watching can see what's up for grabs. */
  @Get(':id/raffles')
  raffles(@Param('id') id: string) {
    return this.auctionsService.listRaffles(id);
  }

  /**
   * Photo of a raffle prize — the phone's camera or its library, both arriving here
   * as a plain file upload. Stored next to the other uploads and served from /uploads.
   */
  @Post(':id/raffle-image')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads/raffles',
      filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${extname(file.originalname) || '.jpg'}`);
      },
    }),
    fileFilter: (_req, file, cb) =>
      file.mimetype.startsWith('image/')
        ? cb(null, true)
        : cb(new BadRequestException('Solo se aceptan imágenes'), false),
    limits: { fileSize: 12 * 1024 * 1024 }, // a phone photo, not a video
  }))
  async uploadRaffleImage(
    @Param('id') id: string,
    @UploadedFile() file: { filename: string; path: string } | undefined,
    @CurrentUser() user: User,
  ) {
    if (!file) throw new BadRequestException('No se recibió la imagen');
    // Multer has already written the file, so a stranger's upload must be swept up here.
    const auction = await this.auctionsService.findOne(id);
    if (auction.sellerId !== user.id && user.role !== UserRole.ADMIN) {
      await unlink(file.path).catch(() => undefined);
      throw new ForbiddenException('Este live no es tuyo');
    }
    return { url: `/uploads/raffles/${file.filename}` };
  }

  /** Seller's own numbers for the live he's running right now. */
  @Get(':id/live-stats')
  @UseGuards(AuthGuard('jwt'))
  liveStats(@Param('id') id: string, @CurrentUser() user: User) {
    return this.auctionsService.sellerLiveStats(id, user.id);
  }

  @Post(':id/raffles')
  @UseGuards(AuthGuard('jwt'))
  createRaffle(@Param('id') id: string, @Body() dto: CreateRaffleDto, @CurrentUser() user: User) {
    return this.auctionsService.createRaffle(id, user.id, dto);
  }

  /** Pick a winner, weighted by minutes watched. */
  @Post(':id/raffles/:raffleId/draw')
  @UseGuards(AuthGuard('jwt'))
  drawRaffle(@Param('raffleId') raffleId: string, @CurrentUser() user: User) {
    return this.auctionsService.drawRaffle(raffleId, user.id);
  }

  @Delete(':id/raffles/:raffleId')
  @UseGuards(AuthGuard('jwt'))
  cancelRaffle(@Param('raffleId') raffleId: string, @CurrentUser() user: User) {
    return this.auctionsService.cancelRaffle(raffleId, user.id);
  }

  /** Award the roulette prize to the winner: records it and creates their order. */
  @Post(':id/giveaway')
  @UseGuards(AuthGuard('jwt'))
  awardGiveaway(
    @Param('id') id: string,
    @Body() dto: AwardGiveawayDto,
    @CurrentUser() user: User,
  ) {
    return this.auctionsService.awardGiveaway(id, user.id, dto.winnerUsername, dto.listingId);
  }

  /** Replay timeline: where each lot (and each bid on it) sits in the recording. */
  @Get(':id/segments')
  @UseGuards(AuthGuard('jwt'))
  segments(@Param('id') id: string, @CurrentUser() user: User) {
    return this.auctionsService.getSegments(id, user.id, user.role === 'admin');
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
    // Banned viewers can't join the room at all
    if (await this.auctionsService.hasActiveBan(id, user.id)) {
      throw new ForbiddenException('Fuiste expulsado de este live');
    }
    const canPublish = auction.sellerId === user.id;
    // Tell the client up front whether video will work, so a failure to connect can be
    // explained honestly instead of blamed on the viewer's wifi.
    const video = await this.livekitService.videoAvailability();
    // With video off for development there is nothing to hand a token for, and minting
    // one would be the one call that still costs quota.
    const token = video.issue === 'disabled'
      ? ''
      : await this.livekitService.generateToken(user.id, user.username, id, canPublish);
    return { token, wsUrl: this.livekitService.wsUrl, videoAvailable: video.ok, videoIssue: video.issue };
  }

  @Patch(':id/start')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  start(@Param('id') id: string, @CurrentUser() user: User, @Body() body?: { durationMs?: number }) {
    return this.auctionsService.start(id, user.id, body?.durationMs);
  }

  @Patch(':id/end')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  end(@Param('id') id: string, @CurrentUser() user: User) {
    return this.auctionsService.end(id, user.id);
  }

  @Patch(':id/cancel')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  cancel(@Param('id') id: string, @CurrentUser() user: User) {
    return this.auctionsService.cancel(id, user.id);
  }

  @Patch(':id/archive')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  archive(@Param('id') id: string, @CurrentUser() user: User) {
    return this.auctionsService.archive(id, user.id);
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

  // ── Moderation ──

  /** Seller designates or removes a moderator. */
  @Patch(':id/moderators')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  setModerator(@Param('id') id: string, @CurrentUser() user: User, @Body() dto: ModeratorDto) {
    return this.auctionsService.setModerator(id, user.id, dto.userId, dto.action === 'add');
  }

  /** A moderator (or the seller) mutes/bans a viewer. */
  @Post(':id/sanctions')
  @UseGuards(AuthGuard('jwt'))
  createSanction(@Param('id') id: string, @CurrentUser() user: User, @Body() dto: SanctionDto) {
    return this.auctionsService.createSanction(id, { id: user.id, username: user.username }, dto);
  }

  /** Seller approves a pending permanent ban. */
  @Patch(':id/sanctions/:sid/approve')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  approveSanction(@Param('id') id: string, @Param('sid') sid: string, @CurrentUser() user: User) {
    return this.auctionsService.approveSanction(id, user.id, sid);
  }

  /** Seller/mod lifts (or rejects) a sanction. */
  @Delete(':id/sanctions/:sid')
  @UseGuards(AuthGuard('jwt'))
  liftSanction(@Param('id') id: string, @Param('sid') sid: string, @CurrentUser() user: User) {
    return this.auctionsService.liftSanction(id, user.id, sid);
  }

  /** Seller left the live — freeze it and start the 10-minute grace period. */
  @Patch(':id/pause')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  pauseLive(@Param('id') id: string, @CurrentUser() user: User) {
    return this.auctionsService.pauseLive(id, user.id);
  }

  /** Seller came back — resume the live. */
  @Patch(':id/resume')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  resumeLive(@Param('id') id: string, @CurrentUser() user: User) {
    return this.auctionsService.resumeLive(id, user.id);
  }

  /** Seller sets the countdown (seconds) for the active card. */
  @Patch('items/:itemId/timer')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  setItemTimer(
    @Param('itemId') itemId: string,
    @Body() dto: SetTimerDto,
    @CurrentUser() user: User,
  ) {
    return this.auctionsService.setItemTimer(itemId, user.id, dto.seconds);
  }

  /** Seller opens a queued lot for bidding (PENDING → ACTIVE with a fresh clock). */
  @Post('items/:itemId/open')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  openItem(@Param('itemId') itemId: string, @CurrentUser() user: User) {
    return this.auctionsService.activateItem(itemId, user.id);
  }

  /** Dutch mode: seller starts (or restarts) the descending clock for this item. */
  @Post('items/:itemId/dutch-start')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  startDutch(@Param('itemId') itemId: string, @CurrentUser() user: User) {
    return this.auctionsService.startDutch(itemId, user.id);
  }

  /** Dutch mode: buyer accepts the current descending price — first one wins. */
  @Post('items/:itemId/dutch-accept')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 10, ttl: 10000 } })
  acceptDutch(@Param('itemId') itemId: string, @CurrentUser() user: User) {
    return this.auctionsService.acceptDutch(itemId, user.id);
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
