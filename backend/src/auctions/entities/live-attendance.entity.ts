import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, Unique,
} from 'typeorm';

/**
 * How long someone actually watched a live.
 *
 * Fed by a heartbeat from the viewer's page rather than by join/leave events: a closed
 * laptop, a dropped connection or a killed tab never send "leave", and counting those as
 * presence would hand raffle entries to people who left hours ago.
 */
@Entity('live_attendance')
@Unique(['auctionId', 'userId'])
@Index('idx_attendance_auction', ['auctionId'])
export class LiveAttendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  auctionId: string;

  @Column()
  userId: string;

  /** Whole seconds watched. Minutes (and raffle entries) are derived from this. */
  @Column({ type: 'int', default: 0 })
  watchedSec: number;

  /** Last heartbeat. Time is credited from here, so a gap credits nothing. */
  @Column({ type: 'timestamptz' })
  lastSeenAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
