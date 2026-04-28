import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('push_tokens')
export class PushToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column({ unique: true })
  token: string; // Expo push token

  @Column({ nullable: true })
  deviceId: string;

  @CreateDateColumn()
  createdAt: Date;
}
