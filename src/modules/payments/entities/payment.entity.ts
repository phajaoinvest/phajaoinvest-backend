import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { CustomerService } from '../../customers/entities/customer-service.entity';
import { SubscriptionPackage } from '../../subscription-packages/entities/subscription-package.entity';

export enum PaymentMethod {
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  BANK_TRANSFER = 'bank_transfer',
  PAYPAL = 'paypal',
  STRIPE = 'stripe',
  CRYPTO = 'crypto',
  MANUAL_TRANSFER = 'manual_transfer',
  RECOUPON = 'recoupon',
  OTHER = 'other',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAYMENT_SLIP_SUBMITTED = 'payment_slip_submitted',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELED = 'canceled',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
}

export enum PaymentType {
  SUBSCRIPTION = 'subscription',
  RENEWAL = 'renewal',
  UPGRADE = 'upgrade',
  REFUND = 'refund',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  customer_id: string;

  @ManyToOne(() => Customer, { nullable: false })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'uuid', nullable: true })
  service_id: string;

  @ManyToOne(() => CustomerService, { nullable: true })
  @JoinColumn({ name: 'service_id' })
  service: CustomerService;

  @Column({ type: 'varchar', length: 255, unique: true })
  payment_intent_id: string;

  @Column({ type: 'enum', enum: PaymentType })
  payment_type: PaymentType;

  @Column({ type: 'enum', enum: PaymentMethod })
  payment_method: PaymentMethod;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  external_payment_id: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  payment_url: string;

  @Column({ type: 'timestamp', nullable: true })
  payment_url_expires_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  paid_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  failed_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  canceled_at: Date;

  @Column({ type: 'text', nullable: true })
  failure_reason: string;

  @Column({ type: 'json', nullable: true })
  payment_metadata: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  provider_response: Record<string, unknown> | null;

  // Link to subscription package (if applicable)
  @Column({ type: 'uuid', nullable: true })
  subscription_package_id: string | null;

  @ManyToOne(() => SubscriptionPackage, { nullable: true })
  @JoinColumn({ name: 'subscription_package_id' })
  subscription_package: SubscriptionPackage | null;

  // Store the resulting subscription expiration at approval time (if applicable)
  @Column({ type: 'timestamp', nullable: true })
  subscription_expires_at: Date | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  refunded_amount: number;

  @Column({ type: 'timestamp', nullable: true })
  refunded_at: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  refund_reason: string;

  // Payment slip fields for manual payments
  @Column({ type: 'varchar', nullable: true })
  payment_slip_url: string | null;

  @Column({ type: 'varchar', nullable: true })
  payment_slip_filename: string | null;

  @Column({ type: 'varchar', nullable: true })
  payment_reference: string | null;

  @Column({ type: 'timestamp', nullable: true })
  payment_slip_submitted_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  approved_by_admin_id: string | null;

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'text', nullable: true })
  admin_notes: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
