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
import { Auction } from './auction.entity';
import { User } from '../../users/user.entity';
import { Bid } from './bid.entity';

export enum CardCondition {
  MINT = 'mint',
  NEAR_MINT = 'near_mint',
  EXCELLENT = 'excellent',
  GOOD = 'good',
  PLAYED = 'played',
}

export enum AuctionItemStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SOLD = 'sold',
  UNSOLD = 'unsold',
}

@Entity('auction_items')
export class AuctionItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  auctionId: string;

  @ManyToOne(() => Auction, (auction) => auction.items)
  @JoinColumn({ name: 'auctionId' })
  auction: Auction;

  @Column()
  cardName: string;

  @Column({ nullable: true })
  cardSet: string;

  @Column({ nullable: true })
  cardNumber: string;

  @Column({ type: 'enum', enum: CardCondition, default: CardCondition.NEAR_MINT })
  condition: CardCondition;

  @Column({ type: 'int' })
  startingPrice: number; // MXN cents

  @Column({ type: 'int', default: 0 })
  currentPrice: number; // MXN cents

  @Column({ type: 'int', nullable: true })
  reservePrice: number; // MXN cents, optional

  @Column({ type: 'simple-array', nullable: true })
  imageUrls: string[];

  @Column({ default: 0 })
  position: number; // order within the auction

  @Column({ type: 'enum', enum: AuctionItemStatus, default: AuctionItemStatus.PENDING })
  status: AuctionItemStatus;

  @Column({ nullable: true })
  winnerId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'winnerId' })
  winner: User;

  @OneToMany(() => Bid, (bid) => bid.auctionItem)
  bids: Bid[];

  @Column({ type: 'timestamp', nullable: true })
  closesAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
