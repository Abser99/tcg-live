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

  @Column({ default: false })
  isDefault: boolean;

  @Column({ nullable: true })
  externalId: string; // Mercado Pago card token (when integrated)

  @CreateDateColumn()
  createdAt: Date;
}
