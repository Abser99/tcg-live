import { Column, CreateDateColumn, Entity, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Listing } from './listing.entity';
import { User } from '../../users/user.entity';

export enum OfferStatus {
  PENDING   = 'pending',
  ACCEPTED  = 'accepted',
  DECLINED  = 'declined',
  WITHDRAWN = 'withdrawn',
}

@Entity('listing_offers')
export class ListingOffer {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() listingId: string;
  @ManyToOne(() => Listing, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listingId' })
  listing: Listing;

  @Column() buyerId: string;
  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'buyerId' })
  buyer: User;

  @Column({ type: 'int' }) amount: number; // MXN cents

  @Column({ type: 'text', nullable: true }) message: string | null;

  @Column({ type: 'enum', enum: OfferStatus, default: OfferStatus.PENDING })
  status: OfferStatus;

  @CreateDateColumn() createdAt: Date;
}
