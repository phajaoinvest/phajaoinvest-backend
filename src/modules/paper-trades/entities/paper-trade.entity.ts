import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PaperTradeStatus } from '../../../common/enums';
import { Customer } from '../../customers/entities/customer.entity';
import { Stock } from '../../stocks/entities/stock.entity';

@Entity('paper_trades')
@Index(['customer_id', 'status'])
export class PaperTrade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false })
  customer_id: string;

  @Column({ type: 'uuid', nullable: false })
  stock_id: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: false,
    comment: 'Amount invested in this paper trade',
  })
  investment_amount: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: false,
    comment: 'Stock price at time of trade entry',
  })
  entry_price: number;

  @Column({
    type: 'decimal',
    precision: 16,
    scale: 8,
    nullable: false,
    comment: 'Calculated: investment_amount / entry_price',
  })
  shares_bought: number;

  @Column({
    type: 'enum',
    enum: PaperTradeStatus,
    default: PaperTradeStatus.OPEN,
  })
  status: PaperTradeStatus;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Stock price at time of trade close',
  })
  close_price: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    comment: 'Realized profit/loss when trade is closed',
  })
  pnl: number;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'When the trade was closed',
  })
  closed_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @ManyToOne(() => Customer, { eager: false })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @ManyToOne(() => Stock, { eager: false })
  @JoinColumn({ name: 'stock_id' })
  stock: Stock;
}
