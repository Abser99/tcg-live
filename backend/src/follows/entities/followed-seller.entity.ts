import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('followed_sellers')
@Unique(['userId', 'sellerId'])
export class FollowedSeller {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  sellerId: string;

  @CreateDateColumn()
  createdAt: Date;
}
