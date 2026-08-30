import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from 'typeorm';

/**
 * "I came to this live because X invited me."
 *
 * One row per friend per live: a friend can only ever be credited to a single referrer,
 * so two people can't both claim the same guest, and re-entering doesn't stack.
 */
@Entity('live_referrals')
@Unique(['auctionId', 'friendId'])
@Index('idx_referrals_auction_referrer', ['auctionId', 'referrerId'])
export class LiveReferral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  auctionId: string;

  /** Who shared the link. */
  @Column()
  referrerId: string;

  /** Who arrived through it. */
  @Column()
  friendId: string;

  @CreateDateColumn()
  createdAt: Date;
}
