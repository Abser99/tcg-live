import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

export enum RaffleStatus {
  PENDING = 'pending',   // announced, still gathering entries
  DRAWN   = 'drawn',     // a winner was picked
  CANCELLED = 'cancelled',
}

/**
 * A raffle attached to a live. Entries come from watch time — one per minute — so the
 * prize rewards sticking around rather than refreshing at the right second.
 *
 * A live can hold several: the seller sets them up before going live or adds more mid-show.
 */
@Entity('raffles')
@Index('idx_raffles_auction', ['auctionId'])
export class Raffle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  auctionId: string;

  @Column()
  sellerId: string;

  /** What's being given away. */
  @Column({ type: 'varchar', length: 120 })
  prizeTitle: string;

  /** Optional catalogue item, so the winner gets a real order they can track. */
  @Column({ type: 'varchar', nullable: true })
  prizeListingId: string | null;

  /** Minutes a viewer must have watched to qualify at all. */
  @Column({ type: 'int', default: 1 })
  minMinutes: number;

  @Column({ type: 'enum', enum: RaffleStatus, default: RaffleStatus.PENDING })
  status: RaffleStatus;

  @Column({ type: 'varchar', nullable: true })
  winnerId: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  winnerUsername: string | null;

  /** Entries the winner held, kept for the record so a draw can be explained later. */
  @Column({ type: 'int', nullable: true })
  winnerEntries: number | null;

  @Column({ type: 'int', nullable: true })
  totalEntries: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  drawnAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
