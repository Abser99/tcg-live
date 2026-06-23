import {
  Entity, PrimaryGeneratedColumn, Column, OneToMany,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
  PENDING   = 'pending',
  CONFIRMED = 'confirmed',
  SHIPPED   = 'shipped',
  DELIVERED = 'delivered',
}

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PAID   = 'paid',
  FAILED = 'failed',
}

export enum PayoutStatus {
  PENDING  = 'pending',   // payment received, waiting for delivery
  RELEASED = 'released',  // funds sent to seller
  FAILED   = 'failed',    // payout attempt failed
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  auctionId: string;

  @Column()
  buyerId: string;

  @Column()
  sellerId: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ nullable: true, length: 10 })
  buyerZip: string;

  /** buyer chooses after winning: 'combined' or 'individual' */
  @Column({ nullable: true })
  shippingChoice: string;

  /** shipping cost in MXN cents, set after seller generates label */
  @Column({ type: 'int', nullable: true })
  shippingCost: number;

  @Column({ nullable: true })
  carrier: string;

  @Column({ nullable: true })
  trackingNumber: string;

  @Column({ nullable: true })
  labelUrl: string;

  /** Total winning bid amount in MXN cents; used to verify webhook payment amount */
  @Column({ type: 'int', nullable: true })
  totalCents: number | null;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.UNPAID })
  paymentStatus: PaymentStatus;

  @Column({ nullable: true })
  mpPreferenceId: string;

  @Column({ nullable: true })
  mpPaymentId: string;

  @Column({ type: 'enum', enum: PayoutStatus, default: PayoutStatus.PENDING })
  payoutStatus: PayoutStatus;

  /** Amount in MXN cents to pay seller (totalCents minus 8% platform commission) */
  @Column({ type: 'int', nullable: true })
  payoutAmount: number | null;

  /** When the payout was released to the seller */
  @Column({ type: 'timestamptz', nullable: true })
  payoutReleasedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  sellerRating: number; // 1–5, set by buyer after delivery

  @Column({ nullable: true, length: 300 })
  sellerRatingNote: string;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true, eager: true })
  items: OrderItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
