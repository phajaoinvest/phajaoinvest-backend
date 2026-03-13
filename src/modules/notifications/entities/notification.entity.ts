import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  NotificationCategory,
  NotificationAction,
  NotificationRecipientType,
} from '../interfaces/notification.interface';
import { Customer } from '../../customers/entities/customer.entity';

@Entity('notifications')
@Index(['recipientId', 'isRead'])
@Index(['recipientId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: NotificationCategory,
    nullable: false,
  })
  category: NotificationCategory;

  @Column({
    type: 'enum',
    enum: NotificationAction,
    nullable: false,
  })
  action: NotificationAction;

  @Column({
    type: 'enum',
    enum: NotificationRecipientType,
    nullable: false,
  })
  recipientType: NotificationRecipientType;

  @Column({ type: 'varchar', nullable: false })
  @Index()
  recipientId: string; // Either "admin" or customer UUID

  // PERFORMANCE: Explicit columns for lightning-fast joins and filtering
  @Column({ type: 'varchar', nullable: true })
  @Index()
  entityType: string;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  entityId: string;

  // PERFORMANCE JOIN: Binary UUID column for fast Customer relationship
  @Column({ type: 'uuid', nullable: true })
  @Index()
  customerId: string;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column({ type: 'varchar', nullable: false })
  title: string;

  @Column({ type: 'text', nullable: false })
  message: string;

  @Column({ type: 'jsonb', nullable: false })
  metadata: Record<string, unknown>;

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @Column({ type: 'varchar', nullable: true })
  createdBy: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date;
}
