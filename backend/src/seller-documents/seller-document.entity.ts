import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum DocumentType {
  CURP = 'curp',
  CONSTANCIA_FISCAL = 'constancia_fiscal',
  OPINION_CUMPLIMIENTO = 'opinion_cumplimiento',
  COMPROBANTE_DOMICILIO = 'comprobante_domicilio',
  IDENTIFICACION = 'identificacion',
  CUENTA_BANCARIA = 'cuenta_bancaria',
}

export enum DocumentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('seller_documents')
export class SellerDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: DocumentType })
  documentType: DocumentType;

  @Column()
  fileUrl: string;

  @Column({ type: 'date', nullable: true })
  emissionDate: string | null;

  @Column({ type: 'enum', enum: DocumentStatus, default: DocumentStatus.PENDING })
  status: DocumentStatus;

  @Column({ type: 'text', nullable: true })
  rejectionNote: string | null;

  @Column({ type: 'varchar', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
