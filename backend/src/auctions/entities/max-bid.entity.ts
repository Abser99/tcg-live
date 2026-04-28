import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Unique } from 'typeorm';

@Entity('max_bids')
@Unique(['auctionItemId', 'userId'])
export class MaxBid {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  auctionItemId: string;

  @Column()
  userId: string;

  @Column({ type: 'int' })
  maxAmountCents: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
