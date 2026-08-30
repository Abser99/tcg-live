import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { AuctionItem } from './auction-item.entity';
import { User } from '../../users/user.entity';

@Index('idx_bids_bidder_created', ['bidderId', 'createdAt'])
@Index('idx_bids_item_created', ['auctionItemId', 'createdAt'])
@Entity('bids')
export class Bid {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  auctionItemId: string;

  @ManyToOne(() => AuctionItem, (item) => item.bids)
  @JoinColumn({ name: 'auctionItemId' })
  auctionItem: AuctionItem;

  @Column()
  bidderId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'bidderId' })
  bidder: User;

  @Column({ type: 'int' })
  amount: number; // MXN cents

  // True for the automatic counter-bid a max bid places on the winner's behalf, so we can
  // tell a real human bid ("who just pushed") apart from the proxy's response.
  @Column({ default: false })
  auto: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
