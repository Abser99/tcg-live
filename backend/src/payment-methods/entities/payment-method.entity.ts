import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export enum PaymentMethodType {
  CARD = 'card',
  OXXO  = 'oxxo',
  SPEI  = 'spei',
}

@Entity('payment_methods')
export class PaymentMethod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: PaymentMethodType })
  type: PaymentMethodType;

  @Column({ nullable: true })
  nickname: string; // e.g. "Visa ****1234"

  @Column({ nullable: true, length: 4 })
  last4: string;

  @Column({ nullable: true })
  brand: string; // visa | mastercard | amex | other

  @Column({ nullable: true })
  expiry: string; // MM/YY — for display only

  /** Name printed on the card. Optional: a card is identified by brand and last four. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  cardholderName: string | null;

  @Column({ default: false })
  isDefault: boolean;

  @Column({ nullable: true })
  externalId: string; // Mercado Pago card token (when integrated)

  /* ── Billing address ──
     Kept on the method, not the user: someone can pay with a work card billed to
     the office and a personal one billed home, and the shipping address is a
     separate thing again. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  billingName: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  street: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  extNumber: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  intNumber: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  colonia: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  zip: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
