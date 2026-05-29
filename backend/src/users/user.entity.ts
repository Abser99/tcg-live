import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  BUYER = 'buyer',
  SELLER = 'seller',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ unique: true })
  username: string;

  @Column({ select: false })
  passwordHash: string;

  @Column({ nullable: true })
  displayName: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ default: 0 })
  balance: number; // in MXN cents

  @Column({ default: 0 })
  reputationScore: number; // positive ratings count (≥ 4 stars)

  @Column({ default: 0 })
  totalRatings: number;

  @Column({ default: 0 })
  totalRatingPoints: number;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.BUYER })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isVerified: boolean; // set to true when seller documents are approved

  @Column({ default: false })
  isSuspended: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  suspendedAt: Date | null;

  @Column({ nullable: true })
  suspendReason: string | null;

  @Column({ nullable: true, length: 300 })
  shippingNote: string;

  @Column({ default: false })
  shippingInsurance: boolean;

  @Column({ nullable: true, length: 10 })
  zipCode: string;

  @Column({ nullable: true })
  street: string;

  @Column({ nullable: true })
  colonia: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
