import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, IsNull, LessThan, Not, Repository } from 'typeorm';
import { Auction, AuctionGame, AuctionStatus, BidMode } from './entities/auction.entity';
import { AuctionItem, AuctionItemStatus } from './entities/auction-item.entity';
import { Bid } from './entities/bid.entity';
import { MaxBid } from './entities/max-bid.entity';
import { LiveSanction, SanctionKind } from './entities/live-sanction.entity';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { PlaceBidDto } from './dto/place-bid.dto';
import { SetMaxBidDto } from './dto/set-max-bid.dto';
import { AuctionsGateway } from './auctions.gateway';
import { UsersService } from '../users/users.service';
import { OrdersService } from '../orders/orders.service';
import { WatchlistService } from '../watchlist/watchlist.service';
import { FollowsService } from '../follows/follows.service';
import { NotificationsService } from '../notifications/notifications.service';
import { bidIncrement, itemDurationMs, ITEM_TIMER_MS, dutchPriceAt } from './auction-pricing';

const MIN_BID_INCREMENT = 100; // 1 MXN in cents (floor for validation)

// The money/time rules live in auction-pricing.ts (pure, unit-tested). Re-exported
// here so existing importers of this module keep working.
export { bidIncrement, itemDurationMs, ITEM_TIMER_MS } from './auction-pricing';
const MAX_ITEM_TIMER_S = 600;   // manual timer ceiling: 10 min (matches the seller's picker)
const ANTI_SNIPE_MS = 10_000;   // extend if bid within last 10s

@Injectable()
export class AuctionsService implements OnModuleInit {
  private readonly logger = new Logger(AuctionsService.name);

  constructor(
    @InjectRepository(Auction)
    private readonly auctionsRepo: Repository<Auction>,
    @InjectRepository(AuctionItem)
    private readonly itemsRepo: Repository<AuctionItem>,
    @InjectRepository(Bid)
    private readonly bidsRepo: Repository<Bid>,
    @InjectRepository(MaxBid)
    private readonly maxBidsRepo: Repository<MaxBid>,
    @InjectRepository(LiveSanction)
    private readonly sanctionsRepo: Repository<LiveSanction>,
    private readonly dataSource: DataSource,
    private readonly gateway: AuctionsGateway,
    private readonly usersService: UsersService,
    private readonly ordersService: OrdersService,
    private readonly watchlistService: WatchlistService,
    private readonly followsService: FollowsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
    // Auto-close auction items whose timer has expired (runs often so a lot closes and
    // declares its winner promptly when the clock hits 0, not up to 10s later).
    setInterval(() => this.autoCloseExpiredItems().catch(() => {}), 3_000);
    // End auctions the seller abandoned (paused for more than the grace period)
    setInterval(() => this.closeAbandonedAuctions().catch(() => {}), 30_000);
    // Remind followers ~1h before a scheduled stream, and nudge the seller when it's due.
    setInterval(() => this.processScheduledStreams().catch(() => {}), 60_000);
  }

  /** How long a live may stay paused after the seller leaves before it closes itself. */
  private static readonly PAUSE_GRACE_MS = 10 * 60 * 1000;

  /** Seller left the live: freeze bidding and (re)start the 10-minute grace period. */
  async pauseLive(auctionId: string, sellerId: string): Promise<Auction> {
    const auction = await this.findOne(auctionId);
    this.assertOwner(auction.sellerId, sellerId);
    if (auction.status !== AuctionStatus.LIVE) return auction;

    auction.pausedAt = new Date(); // re-stamped on every exit → the countdown restarts
    await this.auctionsRepo.save(auction);
    // The lot deadline is shifted on resume by exactly how long the pause lasted,
    // so a short absence doesn't hand the lot extra minutes.

    this.gateway.server?.to(`auction:${auctionId}`).emit('live:paused', {
      auctionId,
      pausedAt: auction.pausedAt.toISOString(),
      closesInMs: AuctionsService.PAUSE_GRACE_MS,
    });
    return this.findOne(auctionId);
  }

  /** Seller came back: unfreeze and clear the grace period. */
  async resumeLive(auctionId: string, sellerId: string): Promise<Auction> {
    const auction = await this.findOne(auctionId);
    this.assertOwner(auction.sellerId, sellerId);
    if (!auction.pausedAt) return auction;

    // Give the active lot back exactly the time the pause consumed. Cap it at the
    // grace period — a clock skew (or a bad timestamp) must never push the deadline
    // hours into the future; we never keep a lot alive longer than the grace anyway.
    const pausedMs = Math.min(
      AuctionsService.PAUSE_GRACE_MS,
      Math.max(0, Date.now() - auction.pausedAt.getTime()),
    );
    if (pausedMs > 0) {
      await this.itemsRepo
        .createQueryBuilder()
        .update(AuctionItem)
        // NULL + interval stays NULL, so only lots with a real clock are shifted.
        .set({ closesAt: () => `"closesAt" + interval '${pausedMs} milliseconds'` })
        .where('"auctionId" = :id AND status = :active', { id: auctionId, active: AuctionItemStatus.ACTIVE })
        .execute();
    }

    auction.pausedAt = null;
    await this.auctionsRepo.save(auction);
    this.gateway.server?.to(`auction:${auctionId}`).emit('live:resumed', { auctionId });
    return this.findOne(auctionId);
  }

  // ─────────────────────────── Moderation ───────────────────────────

  private isMod(auction: Auction, userId: string): boolean {
    return auction.sellerId === userId || (auction.moderatorIds ?? []).includes(userId);
  }

  /** Seller designates or removes a moderator. */
  async setModerator(auctionId: string, sellerId: string, targetUserId: string, add: boolean): Promise<Auction> {
    const auction = await this.findOne(auctionId);
    this.assertOwner(auction.sellerId, sellerId);
    const set = new Set(auction.moderatorIds ?? []);
    if (add) set.add(targetUserId); else set.delete(targetUserId);
    auction.moderatorIds = [...set];
    await this.auctionsRepo.save(auction);
    this.gateway.server?.to(`auction:${auctionId}`).emit('mods:changed', {
      auctionId, moderatorIds: auction.moderatorIds,
    });
    return this.findOne(auctionId);
  }

  /** Active (not lifted, not expired) sanctions that are in effect. */
  async activeSanctions(auctionId: string): Promise<LiveSanction[]> {
    const all = await this.sanctionsRepo.find({ where: { auctionId, active: true } });
    const now = Date.now();
    return all.filter(s => s.approved && (!s.expiresAt || s.expiresAt.getTime() > now));
  }

  /** Pending (unapproved permanent) bans awaiting the seller's OK. */
  async pendingBans(auctionId: string): Promise<LiveSanction[]> {
    return this.sanctionsRepo.find({ where: { auctionId, active: true, approved: false } });
  }

  async hasActiveBan(auctionId: string, userId: string): Promise<boolean> {
    const list = await this.activeSanctions(auctionId);
    return list.some(s => s.kind === SanctionKind.BAN && s.targetUserId === userId);
  }

  /** A mod or the seller mutes/bans a viewer. Permanent bans by a non-seller need approval. */
  async createSanction(
    auctionId: string,
    actor: { id: string; username: string },
    dto: { targetUserId: string; targetUsername: string; kind: SanctionKind; hours?: number },
  ): Promise<LiveSanction> {
    const auction = await this.findOne(auctionId);
    if (!this.isMod(auction, actor.id)) throw new ForbiddenException('Solo moderadores pueden sancionar');
    if (dto.targetUserId === auction.sellerId) throw new BadRequestException('No puedes sancionar al vendedor');
    if ((auction.moderatorIds ?? []).includes(dto.targetUserId) && actor.id !== auction.sellerId) {
      throw new BadRequestException('Solo el vendedor puede sancionar a un moderador');
    }

    const isSeller = actor.id === auction.sellerId;
    const permanent = dto.kind === SanctionKind.BAN && !dto.hours;
    const expiresAt = permanent ? null : new Date(Date.now() + (dto.hours ?? 1) * 3_600_000);
    // Permanent bans from a moderator wait for the seller's approval
    const approved = !(permanent && !isSeller);

    const sanction = await this.sanctionsRepo.save(this.sanctionsRepo.create({
      auctionId,
      targetUserId: dto.targetUserId,
      targetUsername: dto.targetUsername,
      kind: dto.kind,
      expiresAt,
      approved,
      createdById: actor.id,
      createdByUsername: actor.username,
      active: true,
    }));

    const room = `auction:${auctionId}`;
    if (!approved) {
      // Ask the seller to approve, on-screen
      this.gateway.server?.to(room).emit('ban:pending', { auctionId, sanction });
    } else {
      this.gateway.server?.to(room).emit('sanction:new', { auctionId, sanction });
    }
    return sanction;
  }

  /** Seller approves a pending permanent ban. */
  async approveSanction(auctionId: string, sellerId: string, sanctionId: string): Promise<LiveSanction> {
    const auction = await this.findOne(auctionId);
    this.assertOwner(auction.sellerId, sellerId);
    const s = await this.sanctionsRepo.findOne({ where: { id: sanctionId, auctionId } });
    if (!s) throw new NotFoundException('Sanción no encontrada');
    s.approved = true;
    await this.sanctionsRepo.save(s);
    this.gateway.server?.to(`auction:${auctionId}`).emit('sanction:new', { auctionId, sanction: s });
    return s;
  }

  /** Seller/mod lifts a sanction, or the seller rejects a pending ban. */
  async liftSanction(auctionId: string, actorId: string, sanctionId: string): Promise<void> {
    const auction = await this.findOne(auctionId);
    if (!this.isMod(auction, actorId)) throw new ForbiddenException();
    const s = await this.sanctionsRepo.findOne({ where: { id: sanctionId, auctionId } });
    if (!s) throw new NotFoundException('Sanción no encontrada');
    s.active = false;
    await this.sanctionsRepo.save(s);
    this.gateway.server?.to(`auction:${auctionId}`).emit('sanction:lifted', { auctionId, sanctionId, targetUserId: s.targetUserId });
  }

  /** Close lives whose seller never came back within the grace period. */
  /** How long before a scheduled stream we warn the seller's followers. */
  private static readonly REMIND_BEFORE_MS = 60 * 60 * 1000;

  /**
   * Scheduled streams, handled server-side so reminders fire whether or not anyone
   * has the app open:
   *   · ~1h before the start time → tell the seller's followers.
   *   · once the start time passes → nudge the seller to open and start it.
   * A stream is never auto-started: a live needs a person behind the camera, so we
   * only remind. Each reminder is stamped so it goes out exactly once.
   */
  private async processScheduledStreams(): Promise<void> {
    const now = Date.now();

    // ── Followers: inside the hour before the start ──
    const soon = await this.auctionsRepo.find({
      where: {
        status: AuctionStatus.SCHEDULED,
        scheduledAt: Between(new Date(now), new Date(now + AuctionsService.REMIND_BEFORE_MS)),
        followersRemindedAt: IsNull(),
      },
    });
    for (const auction of soon) {
      const minutes = Math.max(1, Math.round((auction.scheduledAt.getTime() - now) / 60_000));
      // Stamp first: a failure mid-fanout must not re-notify everyone next minute.
      auction.followersRemindedAt = new Date();
      await this.auctionsRepo.save(auction);
      try {
        await this.followsService.notifyFollowersLiveSoon(
          auction.sellerId, auction.title, auction.id, minutes,
        );
      } catch (err) {
        this.logger.warn(`Follower reminder failed for auction ${auction.id}: ${err}`);
      }
    }

    // ── Seller: the start time has arrived and it's still not live ──
    const due = await this.auctionsRepo.find({
      where: {
        status: AuctionStatus.SCHEDULED,
        scheduledAt: LessThan(new Date(now)),
        sellerRemindedAt: IsNull(),
      },
    });
    for (const auction of due) {
      auction.sellerRemindedAt = new Date();
      await this.auctionsRepo.save(auction);
      try {
        await this.notificationsService.notifyStreamDue(auction.sellerId, auction.title, auction.id);
      } catch (err) {
        this.logger.warn(`Seller nudge failed for auction ${auction.id}: ${err}`);
      }
    }
  }

  private async closeAbandonedAuctions(): Promise<void> {
    const cutoff = new Date(Date.now() - AuctionsService.PAUSE_GRACE_MS);
    const abandoned = await this.auctionsRepo.find({
      where: { status: AuctionStatus.LIVE, pausedAt: LessThan(cutoff) },
    });
    for (const auction of abandoned) {
      try {
        await this.end(auction.id, auction.sellerId);
        this.gateway.server?.to(`auction:${auction.id}`).emit('live:abandoned', { auctionId: auction.id });
      } catch { /* another instance may have ended it already */ }
    }
  }

  private async autoCloseExpiredItems(): Promise<void> {
    // Heal stuck lots first: an ACTIVE item in a live, non-paused auction must always
    // have a clock. If one lost its closesAt it would never expire (NULL < now is false)
    // and the countdown would show "—" forever. Give it a fresh window.
    await this.itemsRepo
      .createQueryBuilder()
      .update(AuctionItem)
      .set({ closesAt: () => `now() + interval '${ITEM_TIMER_MS} milliseconds'` })
      .where(
        `status = :active AND "closesAt" IS NULL AND "auctionId" IN ` +
          `(SELECT id FROM auctions WHERE status = 'live' AND "pausedAt" IS NULL)`,
        { active: AuctionItemStatus.ACTIVE },
      )
      .execute();

    const expired = await this.itemsRepo.find({
      where: { status: AuctionItemStatus.ACTIVE, closesAt: LessThan(new Date()) },
    });
    for (const item of expired) {
      try {
        // Use a conditional UPDATE to atomically claim this item — prevents double-close
        // in multi-instance deployments. Only the instance that rows-affected=1 proceeds.
        const result = await this.itemsRepo
          .createQueryBuilder()
          .update(AuctionItem)
          .set({
            status: item.winnerId ? AuctionItemStatus.SOLD : AuctionItemStatus.UNSOLD,
          })
          .where('id = :id AND status = :active', {
            id: item.id,
            active: AuctionItemStatus.ACTIVE,
          })
          .execute();

        if (result.affected === 0) {
          // Another instance already closed this item
          continue;
        }

        // Re-fetch to get the authoritative saved state
        const saved = await this.itemsRepo.findOne({ where: { id: item.id } });
        if (!saved) continue;

        await this.handleItemClosed(saved);
        this.logger.log(`Auto-closed item ${item.id} (${item.cardName})`);
      } catch (err) {
        this.logger.warn(`Failed to auto-close item ${item.id}: ${err}`);
      }
    }
  }

  /**
   * Auctions are identified by a per-seller daily counter, not a free-text name:
   * `@usuario-0001-08-25`. The sequence restarts each day.
   */
  async nextAuctionNumber(sellerId: string, when = new Date()): Promise<string> {
    const startOfDay = new Date(when.getFullYear(), when.getMonth(), when.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const countToday = await this.auctionsRepo
      .createQueryBuilder('a')
      .where('a."sellerId" = :sellerId', { sellerId })
      .andWhere('a."createdAt" >= :start AND a."createdAt" < :end', { start: startOfDay, end: endOfDay })
      .getCount();
    const seq = String(countToday + 1).padStart(4, '0');
    const mm = String(when.getMonth() + 1).padStart(2, '0');
    const yy = String(when.getFullYear()).slice(-2);
    const seller = await this.usersService.findById(sellerId);
    return `@${seller?.username ?? 'usuario'}-${seq}-${mm}-${yy}`;
  }

  async create(sellerId: string, dto: CreateAuctionDto): Promise<Auction> {
    // One live stream at a time: block launching a new *immediate* stream while another is
    // live. Scheduled streams (scheduledAt set) are always allowed — they only go live later,
    // and start() re-checks the one-live rule at that point.
    if (dto.isStream && !dto.scheduledAt) {
      const live = await this.auctionsRepo.findOne({
        where: { sellerId, status: AuctionStatus.LIVE },
      });
      if (live) {
        throw new BadRequestException('Ya tienes un stream en vivo. Termínalo antes de iniciar otro.');
      }
    }
    // The title is always the generated number — sellers can't name or rename it.
    const title = await this.nextAuctionNumber(sellerId);
    // A live can have several categories; the first one is the primary `game`.
    const categories = (dto.categories ?? []).filter(Boolean);
    const auction = this.auctionsRepo.create({
      sellerId,
      title,
      game: (categories[0] as AuctionGame) ?? dto.game,
      categories: categories.length ? categories : (dto.game ? [dto.game] : null),
      description: dto.description,
      isStream: dto.isStream ?? false,
      reactionEmojis: dto.reactionEmojis?.slice(0, 6) ?? null,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      items: (dto.items ?? []).map((item, index) =>
        this.itemsRepo.create({
          ...item,
          position: index,
          currentPrice: item.startingPrice,
          binPrice: item.binPrice ?? null,
          gradingCompany: item.gradingCompany ?? null,
          grade: item.grade ?? null,
        }),
      ),
    });
    return this.auctionsRepo.save(auction);
  }

  async findMy(sellerId: string): Promise<Auction[]> {
    return this.auctionsRepo.find({
      where: { sellerId, archivedAt: IsNull() },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  async findBySeller(sellerId: string): Promise<Auction[]> {
    return this.auctionsRepo.find({
      where: { sellerId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }

  async findAll(params: {
    query?: string;
    game?: string;
    condition?: string;
    minPrice?: number;
    maxPrice?: number;
    page?: number;
    limit?: number;
  } = {}): Promise<{ data: Auction[]; total: number; page: number; limit: number }> {
    const { query, game, condition, minPrice, maxPrice } = params;
    const page  = Math.max(1, params.page  ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 20), 50);

    const qb = this.auctionsRepo.createQueryBuilder('a')
      .leftJoinAndSelect('a.seller', 'seller')
      .leftJoinAndSelect('a.items', 'items')
      .where('a.status IN (:...statuses)', { statuses: [AuctionStatus.SCHEDULED, AuctionStatus.LIVE] });

    if (query?.trim()) {
      const q = `%${query.toLowerCase().trim()}%`;
      qb.andWhere(
        `(LOWER(a.title) LIKE :q OR EXISTS (` +
        `SELECT 1 FROM auction_items ai ` +
        `WHERE ai."auctionId" = a.id ` +
        `AND (LOWER(ai."cardName") LIKE :q OR LOWER(ai."cardSet") LIKE :q)` +
        `))`,
        { q },
      );
    }

    if (game?.trim()) {
      qb.andWhere('a.game = :game', { game: game.trim() });
    }

    if (condition?.trim()) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM auction_items ai WHERE ai."auctionId" = a.id AND ai.condition = :condition)`,
        { condition: condition.trim() },
      );
    }

    if (minPrice != null && minPrice > 0) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM auction_items ai WHERE ai."auctionId" = a.id AND ai."startingPrice" >= :minPrice)`,
        { minPrice: minPrice * 100 },
      );
    }

    if (maxPrice != null && maxPrice > 0) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM auction_items ai WHERE ai."auctionId" = a.id AND ai."startingPrice" <= :maxPrice)`,
        { maxPrice: maxPrice * 100 },
      );
    }

    const [data, total] = await qb
      .orderBy('a.status', 'DESC')
      .addOrderBy('a.scheduledAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Auction> {
    const auction = await this.auctionsRepo.findOne({
      where: { id },
      relations: ['seller', 'items', 'items.winner'],
    });
    if (!auction) throw new NotFoundException('Subasta no encontrada');
    // This endpoint is public — expose only the winner's public handle, never the
    // full user record (email, balance, address…).
    for (const item of auction.items ?? []) {
      if (item.winner) {
        item.winner = {
          id: item.winner.id,
          username: item.winner.username,
          avatarUrl: item.winner.avatarUrl ?? null,
        } as any;
      }
      // Flag (but never reveal the amount of) an auto-bid holding the lead
      if (item.winnerId && item.status === AuctionItemStatus.ACTIVE) {
        const hasMax = await this.maxBidsRepo.exists({
          where: { auctionItemId: item.id, userId: item.winnerId },
        });
        (item as any).winnerHasMaxBid = hasMax;

        // Who is challenging the leader — the most recent bidder who ISN'T the
        // current winner. When an auto-bid holds the lead, this is the person
        // pushing the max bidder, so the UI can show "X le puja a Y".
        const rival = await this.bidsRepo.findOne({
          where: { auctionItemId: item.id, bidderId: Not(item.winnerId) },
          order: { createdAt: 'DESC' },
          relations: ['bidder'],
        });
        if (rival?.bidder) {
          (item as any).challenger = {
            username: rival.bidder.username,
            avatarUrl: rival.bidder.avatarUrl ?? null,
          };
        }

        // Who placed the most recent HUMAN bid (ignoring the proxy's auto counter). This
        // is "who just moved": a challenger when they're pushing the leader, or the leader
        // themselves when they raised their own bid with no fight — never a stale name.
        const lastHuman = await this.bidsRepo.findOne({
          where: { auctionItemId: item.id, auto: false },
          order: { createdAt: 'DESC' },
          relations: ['bidder'],
        });
        if (lastHuman?.bidder) {
          (item as any).lastBidder = {
            username: lastHuman.bidder.username,
            avatarUrl: lastHuman.bidder.avatarUrl ?? null,
          };
        }
      }
    }
    // Live moderation state (small lists) so the client can enforce mutes/bans and
    // render the mod panel without extra round-trips.
    (auction as any).sanctions = await this.activeSanctions(id);
    (auction as any).pendingBans = await this.pendingBans(id);
    return auction;
  }

  async update(
    id: string,
    sellerId: string,
    dto: {
      title?: string;
      game?: AuctionGame;
      reactionEmojis?: string[];
      bidMode?: BidMode;
      dutchFloorCents?: number;
    },
  ): Promise<Auction> {
    const auction = await this.findOne(id);
    this.assertOwner(auction.sellerId, sellerId);
    if (auction.status === AuctionStatus.ENDED || auction.status === AuctionStatus.CANCELLED) {
      throw new BadRequestException('No se puede editar una subasta terminada');
    }
    // dto.title is ignored on purpose — the number is the identity of the auction.
    if (dto.game)  auction.game  = dto.game;
    if (dto.reactionEmojis) auction.reactionEmojis = dto.reactionEmojis.slice(0, 6);
    if (dto.bidMode) auction.bidMode = dto.bidMode;
    if (dto.dutchFloorCents   !== undefined) auction.dutchFloorCents   = dto.dutchFloorCents;
    await this.auctionsRepo.save(auction);

    // Tell everyone watching so the bid UI switches format instantly
    this.gateway.server?.to(`auction:${id}`).emit('mode:changed', {
      auctionId: id,
      bidMode: auction.bidMode,
      dutchFloorCents: auction.dutchFloorCents,
    });

    return this.findOne(id);
  }

  async start(id: string, sellerId: string, durationMs?: number): Promise<Auction> {
    const auction = await this.findOne(id);
    this.assertOwner(auction.sellerId, sellerId);
    if (auction.status !== AuctionStatus.SCHEDULED) {
      throw new BadRequestException('La subasta no está en estado programado');
    }

    // One live stream at a time: the seller must end the current one before opening another.
    const alreadyLive = await this.auctionsRepo.findOne({
      where: { sellerId, status: AuctionStatus.LIVE },
    });
    if (alreadyLive) {
      throw new BadRequestException('Ya tienes un stream en vivo. Termínalo antes de iniciar otro.');
    }

    auction.status = AuctionStatus.LIVE;
    auction.startedAt = new Date();

    // Going live does NOT auto-open a lot. Bidding starts only when the seller opens
    // a lot (activateItem / "Abrir puja") — the auction sits live with no clock until then.
    const saved = await this.auctionsRepo.save(auction);

    const firstItem = [...auction.items].sort((a, b) => a.position - b.position)[0];
    if (firstItem) {
      this.gateway.emitAuctionStarted(id, { auctionId: id, firstItemId: firstItem.id });
    }

    this.watchlistService.notifyWatchers(id, auction.title).catch(() => {});
    this.followsService.notifyFollowers(auction.sellerId, auction.title, id).catch(() => {});

    return saved;
  }

  async end(id: string, sellerId: string): Promise<Auction> {
    const auction = await this.findOne(id);
    this.assertOwner(auction.sellerId, sellerId);
    if (auction.status !== AuctionStatus.LIVE) {
      throw new BadRequestException('La subasta no está en vivo');
    }

    auction.status = AuctionStatus.ENDED;
    auction.endedAt = new Date();
    const saved = await this.auctionsRepo.save(auction);

    this.gateway.emitAuctionEnded(id);

    return saved;
  }

  async cancel(id: string, sellerId: string): Promise<Auction> {
    const auction = await this.findOne(id);
    this.assertOwner(auction.sellerId, sellerId);
    if (auction.status !== AuctionStatus.SCHEDULED) {
      throw new BadRequestException('Solo puedes cancelar subastas que aún no han comenzado');
    }
    auction.status = AuctionStatus.CANCELLED;
    return this.auctionsRepo.save(auction);
  }

  async archive(id: string, sellerId: string): Promise<Auction> {
    const auction = await this.auctionsRepo.findOne({ where: { id, sellerId } });
    if (!auction) throw new NotFoundException('Subasta no encontrada');
    if (auction.status !== AuctionStatus.ENDED && auction.status !== AuctionStatus.CANCELLED) {
      throw new BadRequestException('Solo puedes archivar subastas terminadas o canceladas');
    }
    if (auction.status === AuctionStatus.ENDED) {
      const orders = await this.ordersService.getAuctionOrders(id, sellerId);
      const pending = orders.filter(o => o.status !== 'delivered');
      if (pending.length > 0) {
        throw new BadRequestException('Hay órdenes pendientes de entrega. Confirma todos los envíos antes de archivar.');
      }
    }
    auction.archivedAt = new Date();
    return this.auctionsRepo.save(auction);
  }

  async placeBid(itemId: string, bidderId: string, dto: PlaceBidDto): Promise<Bid> {
    const { bid, auctionId, autoBid, closesAt, binTriggered, prevWinnerId, cardName } = await this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(AuctionItem, {
        where: { id: itemId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!item) throw new NotFoundException('Artículo no encontrado');
      if (item.status !== AuctionItemStatus.ACTIVE) {
        throw new BadRequestException('Este artículo no está activo en este momento');
      }

      const auction = await manager.findOne(Auction, { where: { id: item.auctionId } });
      if (auction!.status !== AuctionStatus.LIVE) {
        throw new BadRequestException('La subasta no está en vivo');
      }
      if (auction!.pausedAt) {
        throw new BadRequestException('La subasta está en pausa: el vendedor salió del live.');
      }
      // Once the lot's clock reaches 0 the bidding is closed — reject late bids even in the
      // window before the auto-close cron flips the status. (Anti-snipe already extended
      // closesAt for any bid that landed while time remained.)
      if (item.closesAt && Date.now() >= item.closesAt.getTime()) {
        throw new BadRequestException('La puja ya cerró: se acabó el tiempo.');
      }
      if (auction!.sellerId === bidderId) {
        throw new ForbiddenException('El vendedor no puede pujar en sus propios artículos');
      }
      if (dto.amount <= item.currentPrice) {
        throw new BadRequestException(
          `Bid must be greater than current price of ${item.currentPrice}`,
        );
      }

      if (auction!.bidMode === BidMode.DUTCH) {
        throw new BadRequestException(
          'Esta subasta es holandesa: el precio baja solo y se acepta, no se puja.',
        );
      }

      const prevWinnerId = item.winnerId;
      item.currentPrice = dto.amount;
      item.winnerId = bidderId;

      // Buy It Now: if bid meets or exceeds BIN price, close immediately
      const binTriggered = !!(item.binPrice && dto.amount >= item.binPrice);
      if (binTriggered) {
        item.status = AuctionItemStatus.SOLD;
        item.closesAt = new Date();
      } else if (auction!.bidMode === BidMode.NORMAL) {
        // An active lot must always have a running clock. If it somehow lost one
        // (bad seed, stale data), start a fresh window so the countdown works.
        if (!item.closesAt) {
          item.closesAt = new Date(Date.now() + itemDurationMs(item));
        } else {
          // Anti-snipe: extend the clock if a bid lands in the last 10s.
          // In sudden death the clock is fixed and never resets, so we leave it alone.
          const msLeft = item.closesAt.getTime() - Date.now();
          if (msLeft < ANTI_SNIPE_MS) {
            item.closesAt = new Date(Date.now() + ANTI_SNIPE_MS);
          }
        }
      }
      await manager.save(AuctionItem, item);

      const newBid = manager.create(Bid, { auctionItemId: itemId, bidderId, amount: dto.amount });
      const savedBid = await manager.save(Bid, newBid);

      // Auto-bid only runs when BIN was not triggered
      let autoBid: { bidderId: string; amount: number; bidId: string } | null = null;
      if (!binTriggered && prevWinnerId && prevWinnerId !== bidderId) {
        const maxBidRecord = await manager.findOne(MaxBid, {
          where: { auctionItemId: itemId, userId: prevWinnerId },
        });
        if (maxBidRecord) {
          const nextBid = dto.amount + bidIncrement(dto.amount);
          if (nextBid <= maxBidRecord.maxAmountCents) {
            const autoBidEntity = manager.create(Bid, {
              auctionItemId: itemId,
              bidderId: prevWinnerId,
              amount: nextBid,
              auto: true, // proxy counter, not a human push
            });
            const savedAutoBid = await manager.save(Bid, autoBidEntity);
            item.currentPrice = nextBid;
            item.winnerId = prevWinnerId;
            await manager.save(AuctionItem, item);
            autoBid = { bidderId: prevWinnerId, amount: nextBid, bidId: savedAutoBid.id };
          }
        }
      }

      return { bid: savedBid, auctionId: item.auctionId, autoBid, closesAt: item.closesAt, binTriggered, prevWinnerId, cardName: item.cardName };
    });

    // Notify previous highest bidder that they were outbid (fire-and-forget)
    if (prevWinnerId && prevWinnerId !== bidderId) {
      const amountMxn = (dto.amount / 100).toFixed(0);
      this.notificationsService.sendToUser(prevWinnerId, {
        title: '¡Te superaron!',
        body: `Alguien pujó $${amountMxn} MXN por ${cardName}. Vuelve a pujar para no perderla.`,
        data: { type: 'outbid', auctionId, itemId },
      }).catch(() => {});
    }

    const bidder = await this.usersService.findById(bidderId);
    this.gateway.emitBidPlaced(auctionId, {
      auctionId,
      itemId,
      bidId: bid.id,
      bidderId,
      bidderUsername: bidder.username,
      amount: bid.amount,
      timestamp: bid.createdAt.toISOString(),
      closesAt: closesAt?.toISOString() ?? null,
    });

    if (autoBid) {
      const autoBidder = await this.usersService.findById(autoBid.bidderId);
      this.gateway.emitBidPlaced(auctionId, {
        auctionId,
        itemId,
        bidId: autoBid.bidId,
        bidderId: autoBid.bidderId,
        bidderUsername: autoBidder.username,
        amount: autoBid.amount,
        timestamp: new Date().toISOString(),
        closesAt: closesAt?.toISOString() ?? null,
      });
    }

    // BIN: trigger item close sequence after emitting the winning bid
    if (binTriggered) {
      const soldItem = await this.itemsRepo.findOne({ where: { id: itemId } });
      if (soldItem) await this.handleItemClosed(soldItem);
    }

    return bid;
  }

  async setMaxBid(itemId: string, userId: string, dto: SetMaxBidDto): Promise<void> {
    const item = await this.itemsRepo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Artículo no encontrado');
    if (item.status !== AuctionItemStatus.ACTIVE) {
      throw new BadRequestException('Este artículo no está activo en este momento');
    }
    if (item.closesAt && Date.now() >= item.closesAt.getTime()) {
      throw new BadRequestException('La puja ya cerró: se acabó el tiempo.');
    }
    if (dto.maxAmount <= item.currentPrice) {
      throw new BadRequestException(
        `Max bid must be greater than current price of ${item.currentPrice}`,
      );
    }

    // Sellers cannot place auto-bids on their own items
    const auction = await this.auctionsRepo.findOne({ where: { id: item.auctionId } });
    if (auction?.sellerId === userId) {
      throw new ForbiddenException('El vendedor no puede pujar en sus propios artículos');
    }

    await this.maxBidsRepo.upsert(
      { auctionItemId: itemId, userId, maxAmountCents: dto.maxAmount },
      { conflictPaths: ['auctionItemId', 'userId'] },
    );

    // If not currently winning, immediately auto-bid one step above the current price
    if (item.winnerId !== userId) {
      await this.placeBid(itemId, userId, {
        amount: item.currentPrice + bidIncrement(item.currentPrice),
      });
    }
  }

  /** Dutch price at a moment in time. See auction-pricing.ts for the rule. */
  static dutchPriceAt = dutchPriceAt;

  /** Buyer accepts the current descending price. First one in wins. */
  async acceptDutch(itemId: string, buyerId: string): Promise<{ item: AuctionItem; price: number }> {
    const { item, price } = await this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(AuctionItem, {
        where: { id: itemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException('Artículo no encontrado');
      if (item.status !== AuctionItemStatus.ACTIVE) {
        throw new BadRequestException('Este artículo no está activo en este momento');
      }

      const auction = await manager.findOne(Auction, { where: { id: item.auctionId } });
      if (!auction || auction.status !== AuctionStatus.LIVE) {
        throw new BadRequestException('La subasta no está en vivo');
      }
      if (auction.bidMode !== BidMode.DUTCH) {
        throw new BadRequestException('Esta subasta no está en modo holandés');
      }
      if (auction.sellerId === buyerId) {
        throw new ForbiddenException('El vendedor no puede comprar sus propios artículos');
      }

      const price = AuctionsService.dutchPriceAt(
        item.startingPrice,
        item.dutchStartedAt,
        item.closesAt,
        auction.dutchFloorCents,
      );

      item.currentPrice = price;
      item.winnerId = buyerId;
      item.status = AuctionItemStatus.SOLD;
      item.closesAt = new Date();
      await manager.save(AuctionItem, item);

      // Record it as a bid so history/orders behave like any other sale
      const bid = manager.create(Bid, { auctionItemId: itemId, bidderId: buyerId, amount: price });
      await manager.save(Bid, bid);

      return { item, price };
    });

    this.gateway.server?.to(`auction:${item.auctionId}`).emit('dutch:accepted', {
      itemId: item.id,
      buyerId,
      amount: price,
    });

    await this.handleItemClosed(item);
    return { item, price };
  }

  /** Seller sets the countdown for the active card (seconds, rounded to tens). */
  async setItemTimer(itemId: string, sellerId: string, seconds: number): Promise<AuctionItem> {
    const item = await this.itemsRepo.findOne({ where: { id: itemId }, relations: ['auction'] });
    if (!item) throw new NotFoundException('Artículo no encontrado');
    this.assertOwner(item.auction.sellerId, sellerId);
    if (item.status !== AuctionItemStatus.ACTIVE) {
      throw new BadRequestException('Solo se puede ajustar el reloj de la carta activa');
    }
    const secs = Math.max(10, Math.min(MAX_ITEM_TIMER_S, Math.round(seconds / 10) * 10));
    item.closesAt = new Date(Date.now() + secs * 1000);
    await this.itemsRepo.save(item);

    this.gateway.server?.to(`auction:${item.auctionId}`).emit('timer:set', {
      itemId: item.id,
      closesAt: item.closesAt.toISOString(),
      seconds: secs,
    });
    return item;
  }

  /** Starts (or restarts) the descending clock for the active item. Seller only. */
  async startDutch(itemId: string, sellerId: string): Promise<AuctionItem> {
    const item = await this.itemsRepo.findOne({ where: { id: itemId }, relations: ['auction'] });
    if (!item) throw new NotFoundException('Artículo no encontrado');
    this.assertOwner(item.auction.sellerId, sellerId);
    item.dutchStartedAt = new Date();
    item.currentPrice = item.startingPrice;
    await this.itemsRepo.save(item);
    this.gateway.server?.to(`auction:${item.auctionId}`).emit('dutch:started', {
      itemId: item.id,
      startPrice: item.startingPrice,
      startedAt: item.dutchStartedAt.toISOString(),
    });
    return item;
  }

  async cancelMaxBid(itemId: string, userId: string): Promise<void> {
    const deleted = await this.maxBidsRepo.delete({ auctionItemId: itemId, userId });
    if (!deleted.affected) throw new NotFoundException('No se encontró una puja automática activa para cancelar');
  }

  async closeItem(itemId: string, sellerId: string): Promise<AuctionItem> {
    const item = await this.itemsRepo.findOne({
      where: { id: itemId },
      relations: ['auction', 'bids'],
    });

    if (!item) throw new NotFoundException('Artículo no encontrado');
    this.assertOwner(item.auction.sellerId, sellerId);
    if (item.status !== AuctionItemStatus.ACTIVE) {
      throw new BadRequestException('El artículo no está activo');
    }
    if (item.bids && item.bids.length > 0) {
      throw new BadRequestException('No puedes cerrar un artículo que ya tiene pujas — espera a que termine el tiempo');
    }

    const newStatus = item.winnerId ? AuctionItemStatus.SOLD : AuctionItemStatus.UNSOLD;

    // Atomic status transition — prevents double-close if auto-close fires simultaneously
    const result = await this.itemsRepo
      .createQueryBuilder()
      .update(AuctionItem)
      .set({ status: newStatus })
      .where('id = :id AND status = :active', {
        id: item.id,
        active: AuctionItemStatus.ACTIVE,
      })
      .execute();

    if (result.affected === 0) {
      throw new BadRequestException('El artículo ya fue cerrado por otro proceso');
    }

    item.status = newStatus;
    await this.handleItemClosed(item);

    if (item.status === AuctionItemStatus.UNSOLD && item.autoRelist) {
      this.scheduleAutoRelist(item, item.auction.sellerId).catch(() => {});
    }

    return item;
  }

  private async handleItemClosed(item: AuctionItem): Promise<void> {
    // A lot that reaches 0 STOPS and declares its winner — it does NOT auto-advance
    // to the next lot nor auto-end the auction. The seller opens the next lot manually
    // (activateItem) and ends the live when they're done. This keeps the countdown
    // from looking like it "restarts on its own" at the one-minute mark.

    if (item.winnerId) {
      const [auction, buyer] = await Promise.all([
        this.auctionsRepo.findOne({ where: { id: item.auctionId } }),
        this.usersService.findById(item.winnerId),
      ]);
      await this.ordersService.recordWin({
        auctionId: item.auctionId,
        sellerId: auction!.sellerId,
        buyerId: item.winnerId,
        buyerZip: buyer?.zipCode ?? null,
        auctionItemId: item.id,
        cardName: item.cardName,
        cardSet: item.cardSet,
        finalPrice: item.currentPrice,
        imageUrls: item.imageUrls,
      });
    }

    this.gateway.emitItemClosed(item.auctionId, {
      auctionId: item.auctionId,
      itemId: item.id,
      status: item.status,
      winnerId: item.winnerId ?? null,
      finalPrice: item.currentPrice,
      nextItemId: null,   // no auto-advance — the seller opens the next lot manually
      nextClosesAt: null,
    });
  }

  private async scheduleAutoRelist(item: AuctionItem, sellerId: string): Promise<void> {
    let target = await this.auctionsRepo.findOne({
      where: { sellerId, status: AuctionStatus.SCHEDULED },
      order: { createdAt: 'ASC' },
    });

    if (!target) {
      const sourceAuction = await this.auctionsRepo.findOne({ where: { id: item.auctionId } });
      const newAuction = this.auctionsRepo.create({
        sellerId,
        title: 'Auto-relist',
        game: sourceAuction?.game ?? AuctionGame.OTHER,
        status: AuctionStatus.SCHEDULED,
      });
      target = await this.auctionsRepo.save(newAuction);
    }

    const existing = await this.itemsRepo.find({ where: { auctionId: target.id }, order: { position: 'DESC' } });
    const nextPosition = (existing[0]?.position ?? -1) + 1;

    await this.itemsRepo.save(this.itemsRepo.create({
      auctionId:      target.id,
      cardName:       item.cardName,
      cardSet:        item.cardSet ?? undefined,
      cardNumber:     item.cardNumber ?? undefined,
      condition:      item.condition,
      startingPrice:  item.startingPrice,
      currentPrice:   item.startingPrice,
      reservePrice:   item.reservePrice ?? undefined,
      binPrice:       item.binPrice ?? undefined,
      imageUrls:      item.imageUrls ?? undefined,
      gradingCompany: item.gradingCompany ?? undefined,
      grade:          item.grade ?? undefined,
      position:       nextPosition,
      autoRelist:     false,
    }));
  }

  /**
   * Lots are numbered, not named: `@usuario-0001-08-25`. The counter is per seller and
   * restarts each day, so a live reads as lot 0001, 0002, … for that day.
   */
  async nextLotName(sellerId: string, when = new Date()): Promise<string> {
    const startOfDay = new Date(when.getFullYear(), when.getMonth(), when.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const countToday = await this.itemsRepo
      .createQueryBuilder('i')
      .innerJoin('i.auction', 'a')
      .where('a."sellerId" = :sellerId', { sellerId })
      .andWhere('i."createdAt" >= :start AND i."createdAt" < :end', { start: startOfDay, end: endOfDay })
      .getCount();
    const seq = String(countToday + 1).padStart(4, '0');
    const mm = String(when.getMonth() + 1).padStart(2, '0');
    const yy = String(when.getFullYear()).slice(-2);
    const seller = await this.usersService.findById(sellerId);
    return `@${seller?.username ?? 'usuario'}-${seq}-${mm}-${yy}`;
  }

  async addItem(auctionId: string, sellerId: string, dto: { cardName?: string; startingPrice: number; imageUrls?: string[]; durationSeconds?: number; category?: string }): Promise<Auction> {
    const auction = await this.auctionsRepo.findOne({ where: { id: auctionId }, relations: ['items'] });
    if (!auction) throw new NotFoundException('Subasta no encontrada');
    if (auction.sellerId !== sellerId) throw new ForbiddenException();
    if (auction.status !== AuctionStatus.LIVE && auction.status !== AuctionStatus.SCHEDULED) {
      throw new BadRequestException('Solo puedes agregar cartas a subastas en vivo o próximas');
    }
    // The name is always the generated lot number — the seller can't type one.
    const lotName = await this.nextLotName(sellerId);
    const position = auction.items.length;

    // Lots are added idle (PENDING). Bidding never auto-starts — the seller opens
    // each lot explicitly via activateItem ("Abrir puja"). This keeps one lot in
    // play at a time and lets the seller queue lots ahead of time.
    const savedItem = await this.itemsRepo.save(this.itemsRepo.create({
      auctionId,
      cardName:      lotName,
      startingPrice: dto.startingPrice,
      currentPrice:  dto.startingPrice,
      imageUrls:     dto.imageUrls ?? [],
      position,
      status:        AuctionItemStatus.PENDING,
      closesAt:      undefined,
      // Remember the duration the seller picked; activateItem applies it when the lot opens.
      durationSec:   dto.durationSeconds ?? null,
      category:      dto.category ?? null,
    }));

    this.gateway.server?.to(`auction:${auctionId}`).emit('item:added', {
      auctionId, itemId: savedItem.id, cardName: lotName,
    });

    return this.findOne(auctionId);
  }

  /**
   * Seller opens a queued lot for bidding: PENDING → ACTIVE with a fresh clock.
   * Only one lot may be live at a time; the current one must close first.
   */
  async activateItem(itemId: string, sellerId: string): Promise<AuctionItem> {
    const item = await this.itemsRepo.findOne({ where: { id: itemId }, relations: ['auction'] });
    if (!item) throw new NotFoundException('Artículo no encontrado');
    this.assertOwner(item.auction.sellerId, sellerId);
    if (item.auction.status !== AuctionStatus.LIVE) {
      throw new BadRequestException('La subasta no está en vivo');
    }
    if (item.status !== AuctionItemStatus.PENDING) {
      throw new BadRequestException('Este lote ya no está disponible para abrir');
    }
    const active = await this.itemsRepo.findOne({
      where: { auctionId: item.auctionId, status: AuctionItemStatus.ACTIVE },
    });
    if (active) {
      throw new BadRequestException('Ya hay una puja en curso — ciérrala antes de abrir otra');
    }
    item.status = AuctionItemStatus.ACTIVE;
    item.closesAt = new Date(Date.now() + itemDurationMs(item));
    item.dutchStartedAt = new Date(); // used only while bidMode === dutch
    await this.itemsRepo.save(item);
    this.gateway.emitItemActivated(item.auctionId, {
      auctionId:     item.auctionId,
      itemId:        item.id,
      cardName:      item.cardName,
      startingPrice: item.startingPrice,
      closesAt:      item.closesAt.toISOString(),
    });
    return item;
  }

  async getItemBids(itemId: string): Promise<Bid[]> {
    return this.bidsRepo.find({
      where: { auctionItemId: itemId },
      relations: ['bidder'],
      order: { createdAt: 'DESC' },
      take: 50, // cap to last 50 bids — sufficient for UI display
    });
  }

  async getMyBids(userId: string) {
    const bids = await this.bidsRepo.find({
      where: { bidderId: userId },
      relations: ['auctionItem', 'auctionItem.auction'],
      order: { createdAt: 'DESC' },
      take: 500, // cap to most recent 500 bids; adequate for the UI
    });

    // One entry per item — keep highest bid
    const seen = new Map<string, typeof bids[0]>();
    for (const bid of bids) {
      if (!bid.auctionItem) continue;
      const prev = seen.get(bid.auctionItemId);
      if (!prev || bid.amount > prev.amount) seen.set(bid.auctionItemId, bid);
    }

    return Array.from(seen.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(bid => ({
        id: bid.id,                  // so the UI's list key (bid.id) is defined
        auctionItemId: bid.auctionItemId,
        amount: bid.amount,          // alias so the UI's `bid.amount` renders (not $NaN)
        myTopBid: bid.amount,
        createdAt: bid.createdAt,    // alias for the UI
        lastBidAt: bid.createdAt,
        item: bid.auctionItem,
        auction: bid.auctionItem.auction,
      }));
  }

  async relist(id: string, sellerId: string): Promise<Auction> {
    const source = await this.findOne(id);
    this.assertOwner(source.sellerId, sellerId);
    if (source.status !== AuctionStatus.ENDED) {
      throw new BadRequestException('Solo puedes volver a listar subastas terminadas');
    }

    const unsold = source.items.filter(i => i.status === AuctionItemStatus.UNSOLD);
    if (!unsold.length) {
      throw new BadRequestException('No hay items no vendidos en esta subasta');
    }

    const newAuction = this.auctionsRepo.create({
      sellerId,
      title: source.title,
      game: source.game,
      description: source.description ?? undefined,
      items: unsold.map((item, index) =>
        this.itemsRepo.create({
          cardName:       item.cardName,
          cardSet:        item.cardSet ?? undefined,
          cardNumber:     item.cardNumber ?? undefined,
          condition:      item.condition,
          startingPrice:  item.startingPrice,
          currentPrice:   item.startingPrice,
          reservePrice:   item.reservePrice ?? undefined,
          binPrice:       item.binPrice ?? undefined,
          gradingCompany: item.gradingCompany ?? undefined,
          grade:          item.grade ?? undefined,
          imageUrls:      item.imageUrls ?? undefined,
          position:       index,
        }),
      ),
    });

    return this.auctionsRepo.save(newAuction);
  }

  private assertOwner(ownerId: string, requesterId: string): void {
    if (ownerId !== requesterId) throw new ForbiddenException();
  }
}
