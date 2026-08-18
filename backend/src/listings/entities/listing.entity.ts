import { Column, CreateDateColumn, Entity, ManyToOne, JoinColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/user.entity';

export enum ListingStatus {
  ACTIVE = 'active',
  SOLD = 'sold',
  CANCELLED = 'cancelled',
}

@Entity('listings')
export class Listing {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() sellerId: string;
  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'sellerId' })
  seller: User;

  @Column() title: string;
  @Column({ nullable: true, type: 'text' }) description: string;
  @Column() price: number; // MXN cents
  @Column({ type: 'int', default: 0 }) discountPercent: number; // 0–95, applied off `price`
  @Column({ type: 'boolean', default: false }) promoted: boolean; // shown as an on-screen banner during the live
  @Column({ type: 'varchar', nullable: true }) game: string;
  @Column({ type: 'varchar', nullable: true }) condition: string;
  @Column({ type: 'simple-array', nullable: true }) imageUrls: string[];

  @Column({ type: 'enum', enum: ListingStatus, default: ListingStatus.ACTIVE })
  status: ListingStatus;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
