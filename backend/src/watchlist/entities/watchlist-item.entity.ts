import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique,
} from 'typeorm';

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
}
