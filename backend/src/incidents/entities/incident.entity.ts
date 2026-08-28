import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum IncidentKind {
  /** Something happened on camera during a live. */
  LIVE = 'live',
  /** The seller went quiet after a purchase. */
  NO_RESPONSE = 'no_response',
  /** A complaint about another seller's conduct. */
  SELLER_REPORT = 'seller_report',
  OTHER = 'other',
}

export enum IncidentStatus {
  OPEN = 'open',
  REVIEWING = 'reviewing',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

/**
 * A report an admin has to look at.
 *
 * For something that happened on air we don't keep a rolling video buffer: the live is
 * already being recorded, so the report just marks *when* — the moment it was raised and
 * the minute before it — and the admin opens the existing recording at that point.
 */
@Entity('incidents')
@Index('idx_incidents_status', ['status'])
export class Incident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: IncidentKind, default: IncidentKind.OTHER })
  kind: IncidentKind;

  @Column()
  reporterId: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  reporterUsername: string | null;

  /** The live it happened in, when it happened in one. */
  @Column({ type: 'varchar', nullable: true })
  auctionId: string | null;

  /** The order it's about, for a purchase gone wrong. */
  @Column({ type: 'varchar', nullable: true })
  orderId: string | null;

  /** Who is being reported, when the report is about a person. */
  @Column({ type: 'varchar', nullable: true })
  reportedUserId: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  reportedUsername: string | null;

  @Column({ type: 'text' })
  description: string;

  /** Seconds into the recording when "report" was pressed. */
  @Column({ type: 'int', nullable: true })
  atOffsetSec: number | null;

  /** The window to review: the minute before the report, through the moment itself. */
  @Column({ type: 'int', nullable: true })
  fromOffsetSec: number | null;

  @Column({ type: 'int', nullable: true })
  toOffsetSec: number | null;

  @Column({ type: 'enum', enum: IncidentStatus, default: IncidentStatus.OPEN })
  status: IncidentStatus;

  @Column({ type: 'text', nullable: true })
  adminNote: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
