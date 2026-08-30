import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

export enum SanctionKind {
  MUTE = 'mute',
  BAN = 'ban',
}

/** A mute or ban a moderator/seller applied to a viewer within one live. */
@Index('idx_live_sanction_auction_target', ['auctionId', 'targetUserId', 'kind'])
@Entity('live_sanctions')
export class LiveSanction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  auctionId: string;

  @Column()
  targetUserId: string;

  @Column()
  targetUsername: string;

  @Column({ type: 'enum', enum: SanctionKind })
  kind: SanctionKind;

  /** null = permanent (bans only). */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  /** Permanent bans start unapproved and need the seller's OK to take effect. */
  @Column({ default: true })
  approved: boolean;

  @Column()
  createdById: string;

  @Column()
  createdByUsername: string;

  @Column({ default: true })
  active: boolean; // set false when lifted early

  @CreateDateColumn()
  createdAt: Date;
}
