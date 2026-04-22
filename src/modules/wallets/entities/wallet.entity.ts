import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { WalletStatus } from '../../../common/enums';
import { Customer } from '../../customers/entities/customer.entity';

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'float', default: 0, comment: 'is the value of stock' })
  total_balance: number;

  @Column({ type: 'float', default: 0 })
  total_recharge: number;

  @Column({ type: 'float', default: 0 })
  total_deposit: number;

  @Column({ type: 'float', default: 0, comment: '$' })
  total_cash: number;

  @Column({
    type: 'float',
    default: 20000,
    comment: 'Demo trading balance - separate from real money. Default $20,000',
  })
  demo_balance: number;

  @Column({
    type: 'enum',
    enum: WalletStatus,
    default: WalletStatus.ACTIVE,
  })
  status: WalletStatus;

  @Column({ type: 'uuid', nullable: true })
  customer_id: string;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @Column({ type: 'uuid', nullable: true })
  updated_by: string;

  @Column({ type: 'uuid', nullable: true })
  deleted_by: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @OneToOne(() => Customer, 'wallet')
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;
}
