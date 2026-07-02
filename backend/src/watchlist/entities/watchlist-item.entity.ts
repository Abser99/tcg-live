import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique, ManyToOne, JoinColumn,
} from 'typeorm';
import { Auction } from '../../auctions/entities/auction.entity';

@Entity('watchlist_items')
@Unique(['userId', 'auctionId'])
export class WatchlistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  auctionId: string;

  @ManyToOne(() => Auction, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'auctionId' })
  auction: Auction;

  @CreateDateColumn()
  createdAt: Date;
}
