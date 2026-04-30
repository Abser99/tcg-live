import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum DisputeStatus {
  OPEN         = 'open',
  UNDER_REVIEW = 'under_review',
  RESOLVED     = 'resolved',
  REJECTED     = 'rejected',
}

export enum DisputeReason {
  NOT_RECEIVED     = 'not_received',
  WRONG_ITEM       = 'wrong_item',
  DAMAGED          = 'damaged',
  NOT_AS_DESCRIBED = 'not_as_described',
  OTHER            = 'other',
}

@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @Column()
  buyerId: string;

  @Column()
  sellerId: string;

  @Column({ type: 'enum', enum: DisputeReason })
  reason: DisputeReason;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: DisputeStatus, default: DisputeStatus.OPEN })
  status: DisputeStatus;

  @Column({ nullable: true, type: 'text' })
  resolutionNote: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
