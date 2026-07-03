import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique,
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

  @CreateDateColumn()
  createdAt: Date;

  // Populated manually in WatchlistService.findByUser — not a DB column
  auction?: Auction;
}
