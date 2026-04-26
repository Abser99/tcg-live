import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { AuctionItem } from './auction-item.entity';
import { User } from '../../users/user.entity';

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

  @CreateDateColumn()
  createdAt: Date;
}
