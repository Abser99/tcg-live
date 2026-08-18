import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { AuctionItem } from './auction-item.entity';

export enum AuctionStatus {
  SCHEDULED = 'scheduled',
  LIVE = 'live',
  ENDED = 'ended',
  CANCELLED = 'cancelled',
}

/** How bidding behaves for this auction. The seller can switch live. */
export enum BidMode {
  /** Classic: the clock extends when a bid lands in the final seconds (anti-snipe). */
  NORMAL = 'normal',
  /** Sudden death: bids raise the price but the clock never resets — it just runs out. */
  SUDDEN_DEATH = 'sudden_death',
  /** Dutch: the price descends on a timer; the first buyer to accept wins. */
  DUTCH = 'dutch',
}

export enum AuctionGame {
  POKEMON     = 'pokemon',
  MTG         = 'mtg',
  YUGIOH      = 'yugioh',
  ONEPIECE    = 'onepiece',
  LORCANA     = 'lorcana',
  DRAGONBALL  = 'dragonball',
  SPORTS      = 'sports',
  OTHER       = 'other',
}

@Entity('auctions')
export class Auction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sellerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sellerId' })
  seller: User;

  @Column()
  title: string;

  @Column({ type: 'enum', enum: AuctionGame, default: AuctionGame.POKEMON })
  game: AuctionGame;

  // A live can span several categories; `game` stays as the primary for back-compat.
  @Column({ type: 'simple-array', nullable: true })
  categories: string[] | null;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: AuctionStatus, default: AuctionStatus.SCHEDULED })
  status: AuctionStatus;

  @Column({ nullable: true })
  scheduledAt: Date;

  /** Set once we've told this seller's followers the stream is about to start. */
  @Column({ type: 'timestamptz', nullable: true })
  followersRemindedAt: Date | null;

  /** Set once we've nudged the seller that their scheduled stream is due. */
  @Column({ type: 'timestamptz', nullable: true })
  sellerRemindedAt: Date | null;

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  endedAt: Date;

  @Column({ default: false })
  isStream: boolean;

  /** Reaction emojis the seller picked for the live view (up to 6). */
  @Column({ type: 'simple-array', nullable: true })
  reactionEmojis: string[] | null;

  /** User IDs the seller designated as moderators for this live. */
  @Column({ type: 'simple-array', nullable: true })
  moderatorIds: string[] | null;

  /**
   * Set when the seller leaves the live. While paused, bidding is frozen and the
   * auction auto-closes if the seller doesn't come back within 10 minutes.
   * Re-stamped on every exit, so the grace period restarts each time.
   */
  @Column({ type: 'timestamptz', nullable: true })
  pausedAt: Date | null;

  /** Bidding format — the seller can switch this mid-stream. */
  @Column({ type: 'enum', enum: BidMode, default: BidMode.NORMAL })
  bidMode: BidMode;

  /**
   * @deprecated Dead since the dutch descent became linear: the price now falls evenly
   * from the lot's start price to `dutchFloorCents` across the lot timer, so the rate is
   * derived from time and no step/interval is configurable. Nothing reads or writes these
   * two; they stay only so existing rows keep their data. Drop them in a later migration.
   */
  @Column({ type: 'int', default: 100 })
  dutchStepCents: number;

  /** @deprecated See {@link dutchStepCents}. */
  @Column({ type: 'int', default: 1 })
  dutchIntervalSec: number;

  /** Dutch mode: price never falls below this (MXN cents). */
  @Column({ type: 'int', default: 0 })
  dutchFloorCents: number;

  @Column({ nullable: true })
  livestreamRoomId: string;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @OneToMany(() => AuctionItem, (item) => item.auction, { cascade: true })
  items: AuctionItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
