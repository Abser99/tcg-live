import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('auction_templates')
@Index(['sellerId'])
export class AuctionTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sellerId: string;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 120 })
  title: string;

  @Column({ length: 30 })
  game: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ type: 'jsonb' })
  items: {
    cardName: string;
    cardSet?: string;
    cardNumber?: string;
    condition: string;
    startingPrice: number;
    reservePrice?: number;
    imageUrls?: string[];
  }[];

  @CreateDateColumn()
  createdAt: Date;
}
