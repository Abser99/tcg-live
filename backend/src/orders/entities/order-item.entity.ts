import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items)
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'varchar', nullable: true })
  auctionItemId: string | null;

  @Column()
  cardName: string;

  @Column({ nullable: true })
  cardSet: string;

  @Column({ type: 'int' })
  finalPrice: number; // MXN cents

  @Column({ type: 'simple-array', nullable: true })
  imageUrls: string[];
}
