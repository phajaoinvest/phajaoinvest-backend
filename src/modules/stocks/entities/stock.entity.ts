import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { StockCategory } from '../../stock-categories/entities/stock-category.entity';
import { CustomerStock } from '../../customer-stocks/entities/customer-stock.entity';

@Entity('stocks')
@Index(['symbol', 'exchange'], { unique: true })
@Index(['ibkr_contract_id'], { unique: true })
export class Stock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Basic Stock Information
  @Column({ type: 'varchar', length: 255, nullable: false })
  @Index()
  name: string;

  @Column({ type: 'varchar', length: 10, nullable: false })
  @Index()
  symbol: string;

  @Column({ type: 'varchar', length: 10, nullable: false, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', length: 20, nullable: false, default: 'SMART' })
  exchange: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  primary_exchange: string;

  @Column({ type: 'varchar', length: 20, nullable: false, default: 'STK' })
  security_type: string; // STK, OPT, FUT, CASH, etc.

  // Interactive Brokers Specific
  @Column({ type: 'bigint', nullable: true, unique: true })
  ibkr_contract_id: number; // IBKR Contract ID (conId)

  @Column({ type: 'varchar', length: 50, nullable: true })
  local_symbol: string; // Local exchange symbol

  // Company Information
  @Column({ type: 'varchar', length: 500, nullable: true })
  company: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  industry: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  sector: string;

  @Column({ type: 'bigint', nullable: true })
  market_cap: number;

  @Column({ type: 'bigint', nullable: true })
  shares_outstanding: number;

  // Real-time Price Data
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Current/latest market price',
  })
  @Index()
  last_price: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Previous trading day close price',
  })
  previous_close: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Current day opening price',
  })
  open_price: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Highest bid price',
  })
  bid_price: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Lowest ask price',
  })
  ask_price: number;

  @Column({
    type: 'int',
    nullable: true,
    comment: 'Bid size',
  })
  bid_size: number;

  @Column({
    type: 'int',
    nullable: true,
    comment: 'Ask size',
  })
  ask_size: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Highest price of the day',
  })
  high_price: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Lowest price of the day',
  })
  low_price: number;

  @Column({
    type: 'bigint',
    nullable: true,
    comment: 'Total volume traded',
  })
  volume: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Price change from previous close',
  })
  change: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    comment: 'Percentage change from previous close',
  })
  change_percent: number;

  // Trading Information
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Minimum price increment',
  })
  min_tick: number;

  @Column({
    type: 'int',
    nullable: true,
    comment: 'Minimum order size',
  })
  min_size: number;

  @Column({ type: 'boolean', default: true })
  is_tradable: boolean;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  // Paper Trading Controls
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    default: 10000,
    comment: 'Maximum investment amount allowed per paper trade',
  })
  max_investment: number;

  @Column({
    type: 'boolean',
    default: true,
    comment: 'Whether to show the ticker symbol to customers',
  })
  show_symbol: boolean;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether this stock is available for demo/paper trading (Guess Buy)',
  })
  is_demo: boolean;

  // Market Hours & Status
  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Market status: OPEN, CLOSED, PRE_MARKET, AFTER_HOURS',
  })
  market_status: string;

  @Column({
    type: 'time',
    nullable: true,
    comment: 'Market opening time',
  })
  market_open_time: string;

  @Column({
    type: 'time',
    nullable: true,
    comment: 'Market closing time',
  })
  market_close_time: string;

  // Data Timestamps
  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Last price update timestamp',
  })
  @Index()
  last_price_update: Date;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Last trade timestamp',
  })
  last_trade_time: Date;

  // Fundamental Data
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Price to earnings ratio',
  })
  pe_ratio: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 4,
    nullable: true,
    comment: 'Dividend yield percentage',
  })
  dividend_yield: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Earnings per share',
  })
  eps: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: '52-week high price',
  })
  week_52_high: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: '52-week low price',
  })
  week_52_low: number;

  // Data Source & Quality
  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Data source provider',
  })
  data_source: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    default: 'DELAYED',
    comment: 'Data type: REAL_TIME, DELAYED, SNAPSHOT',
  })
  data_type: string;

  @Column({
    type: 'int',
    nullable: true,
    default: 15,
    comment: 'Data delay in minutes',
  })
  data_delay_minutes: number;

  // Audit Fields
  @Column({ type: 'uuid', nullable: true })
  stock_categories_id: string;

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
  @ManyToOne(() => StockCategory, (category) => category.stocks, {
    nullable: true,
  })
  @JoinColumn({ name: 'stock_categories_id' })
  stockCategory?: StockCategory | null;

  @OneToMany(() => CustomerStock, (customerStock) => customerStock.stock)
  customerStocks: CustomerStock[];
}
