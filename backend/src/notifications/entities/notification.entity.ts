import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('notifications')
@Index(['userId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Recipient user id */
  @Index()
  @Column()
  userId: string;

  /** Machine type, e.g. new_order / new_message / auction_win / outbid … */
  @Column({ type: 'varchar', length: 60, default: 'general' })
  type: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  /** In-app deep link this notification points to (e.g. /compras, /mensajes, /auctions/:id) */
  @Column({ type: 'varchar', nullable: true })
  link: string | null;

  @Column({ default: false })
  read: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
