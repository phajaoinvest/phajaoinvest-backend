import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsBoolean,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockCategoryEmbeddedExample } from '../../../docs/swagger';

export class CreateStockDto {
  @ApiProperty({ example: 'Apple Inc.', description: 'Full stock name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'AAPL', description: 'Ticker symbol' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({ example: 175.34, description: 'Latest traded price' })
  @IsNumber()
  @Min(0)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? parseFloat(value) : (value as number),
  )
  last_price: number;

  @ApiPropertyOptional({
    example: '77777777-8888-9999-aaaa-bbbbbbbbbbbb',
    description: 'Optional stock category ID (UUID)',
  })
  @IsUUID()
  @IsOptional()
  stock_categories_id?: string;

  @ApiPropertyOptional({ example: 10000, description: 'Max investment per paper trade' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? parseFloat(value) : (value as number),
  )
  max_investment?: number;

  @ApiPropertyOptional({ example: true, description: 'Show ticker symbol to customers' })
  @IsOptional()
  show_symbol?: boolean;
}

export class UpdateStockDto {
  @ApiPropertyOptional({
    example: 'Apple Inc. New',
    description: 'Updated stock name',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    example: 'AAPL',
    description: 'Updated ticker symbol',
  })
  @IsString()
  @IsOptional()
  symbol?: string;

  @ApiPropertyOptional({ example: 'A tech company', description: 'Stock description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Technology', description: 'Stock sector' })
  @IsString()
  @IsOptional()
  sector?: string;

  @ApiPropertyOptional({ example: 'Consumer Electronics', description: 'Stock industry' })
  @IsString()
  @IsOptional()
  industry?: string;

  @ApiPropertyOptional({ example: 'US', description: 'Country' })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({ example: 'NASDAQ', description: 'Exchange' })
  @IsString()
  @IsOptional()
  exchange?: string;

  @ApiPropertyOptional({ example: 'USD', description: 'Currency' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: 180.5, description: 'Updated price' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? parseFloat(value) : (value as number),
  )
  last_price?: number;

  @ApiPropertyOptional({
    example: '77777777-8888-9999-aaaa-bbbbbbbbbbbb',
    description: 'Updated category ID',
  })
  @IsUUID()
  @IsOptional()
  stock_categories_id?: string;

  @ApiPropertyOptional({
    example: '77777777-8888-9999-aaaa-bbbbbbbbbbbb',
    description: 'Category ID (alias for stock_categories_id)',
  })
  @IsUUID()
  @IsOptional()
  category_id?: string;

  @ApiPropertyOptional({ example: 10000, description: 'Max investment per paper trade' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? parseFloat(value) : (value as number),
  )
  max_investment?: number;

  @ApiPropertyOptional({ example: true, description: 'Show ticker symbol to customers' })
  @IsBoolean()
  @IsOptional()
  show_symbol?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Enable stock for demo/paper trading (Guess Buy)' })
  @IsBoolean()
  @IsOptional()
  is_demo?: boolean;
}

export class StockResponseDto {
  @ApiProperty({
    example: '11111111-2222-3333-4444-555555555555',
    description: 'Stock UUID',
  })
  id: string;

  @ApiProperty({ example: 'Apple Inc.', description: 'Stock name' })
  name: string;

  @ApiProperty({ example: 'AAPL', description: 'Ticker symbol' })
  symbol: string;

  @ApiPropertyOptional({ example: 'USD', description: 'Currency' })
  currency?: string;

  @ApiPropertyOptional({ example: 'NASDAQ', description: 'Exchange' })
  exchange?: string;

  @ApiPropertyOptional({ example: 'NASDAQ', description: 'Primary exchange' })
  primary_exchange?: string;

  @ApiPropertyOptional({ example: 'STK', description: 'Security type' })
  security_type?: string;

  @ApiPropertyOptional({ example: 'Apple Inc.', description: 'Company name' })
  company?: string;

  @ApiPropertyOptional({ example: 'USA', description: 'Country' })
  country?: string;

  @ApiPropertyOptional({
    example: 'Apple designs, manufactures, and markets smartphones...',
    description: 'Description',
  })
  description?: string;

  @ApiPropertyOptional({ example: 'Consumer Electronics', description: 'Industry' })
  industry?: string;

  @ApiPropertyOptional({ example: 'Technology', description: 'Sector' })
  sector?: string;

  @ApiPropertyOptional({ example: 2800000000000, description: 'Market capitalization' })
  market_cap?: number;

  @ApiPropertyOptional({ example: 15400000000, description: 'Shares outstanding' })
  shares_outstanding?: number;

  // Real-time Price Data
  @ApiProperty({ example: 175.34, description: 'Last price' })
  last_price: number;

  @ApiPropertyOptional({ example: 173.5, description: 'Previous close price' })
  previous_close?: number;

  @ApiPropertyOptional({ example: 174.0, description: 'Open price' })
  open_price?: number;

  @ApiPropertyOptional({ example: 175.0, description: 'Bid price' })
  bid_price?: number;

  @ApiPropertyOptional({ example: 175.1, description: 'Ask price' })
  ask_price?: number;

  @ApiPropertyOptional({ example: 100, description: 'Bid size' })
  bid_size?: number;

  @ApiPropertyOptional({ example: 200, description: 'Ask size' })
  ask_size?: number;

  @ApiPropertyOptional({ example: 176.5, description: 'High price of the day' })
  high_price?: number;

  @ApiPropertyOptional({ example: 172.0, description: 'Low price of the day' })
  low_price?: number;

  @ApiPropertyOptional({ example: 52300000, description: 'Volume traded' })
  volume?: number;

  @ApiPropertyOptional({ example: 1.84, description: 'Price change' })
  change?: number;

  @ApiPropertyOptional({ example: 1.06, description: 'Percentage change' })
  change_percent?: number;

  // Trading Information
  @ApiPropertyOptional({ example: 0.01, description: 'Minimum tick' })
  min_tick?: number;

  @ApiPropertyOptional({ example: 1, description: 'Minimum order size' })
  min_size?: number;

  @ApiPropertyOptional({ example: true, description: 'Is tradable' })
  is_tradable?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Is active' })
  is_active?: boolean;

  @ApiPropertyOptional({ example: 10000, description: 'Max investment per paper trade' })
  max_investment?: number;

  @ApiPropertyOptional({ example: true, description: 'Show ticker symbol to customers' })
  show_symbol?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Available for demo/paper trading' })
  is_demo?: boolean;

  // Market Hours & Status
  @ApiPropertyOptional({ example: 'OPEN', description: 'Market status' })
  market_status?: string;

  @ApiPropertyOptional({ example: '09:30:00', description: 'Market open time' })
  market_open_time?: string;

  @ApiPropertyOptional({ example: '16:00:00', description: 'Market close time' })
  market_close_time?: string;

  // Timestamps
  @ApiPropertyOptional({ description: 'Last price update' })
  last_price_update?: Date;

  @ApiPropertyOptional({ description: 'Last trade time' })
  last_trade_time?: Date;

  // Fundamental Data
  @ApiPropertyOptional({ example: 29.5, description: 'P/E ratio' })
  pe_ratio?: number;

  @ApiPropertyOptional({ example: 0.52, description: 'Dividend yield' })
  dividend_yield?: number;

  @ApiPropertyOptional({ example: 5.89, description: 'Earnings per share' })
  eps?: number;

  @ApiPropertyOptional({ example: 199.62, description: '52-week high' })
  week_52_high?: number;

  @ApiPropertyOptional({ example: 124.17, description: '52-week low' })
  week_52_low?: number;

  // Data Source
  @ApiPropertyOptional({ example: 'FMP', description: 'Data source provider' })
  data_source?: string;

  @ApiPropertyOptional({ example: 'REAL_TIME', description: 'Data type' })
  data_type?: string;

  @ApiPropertyOptional({ example: 15, description: 'Data delay in minutes' })
  data_delay_minutes?: number;

  @ApiPropertyOptional({
    example: StockCategoryEmbeddedExample,
    description: 'Category object if related category is loaded',
  })
  stockCategory?: {
    id: string;
    name: string;
  };

  @ApiProperty({
    example: '2025-01-01T10:00:00.000Z',
    description: 'Creation timestamp',
  })
  created_at: Date;

  @ApiProperty({
    example: '2025-01-05T12:00:00.000Z',
    description: 'Last update timestamp',
  })
  updated_at: Date;
}

export class BuyStockDto {
  @ApiProperty({
    example: '11111111-2222-3333-4444-555555555555',
    description: 'Stock ID to buy',
  })
  @IsUUID()
  @IsNotEmpty()
  stock_id: string;

  @ApiProperty({ example: 10, description: 'Quantity of shares to buy' })
  @IsNumber()
  @Min(0.01)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? parseFloat(value) : (value as number),
  )
  quantity: number;

  @ApiProperty({ example: 175.5, description: 'Buy price per share' })
  @IsNumber()
  @Min(0.01)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? parseFloat(value) : (value as number),
  )
  buy_price: number;
}

export class SellStockDto {
  @ApiProperty({
    example: '11111111-2222-3333-4444-555555555555',
    description: 'Stock ID to sell',
  })
  @IsUUID()
  @IsNotEmpty()
  stock_id: string;

  @ApiProperty({ example: 5, description: 'Quantity of shares to sell' })
  @IsNumber()
  @Min(0.01)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? parseFloat(value) : (value as number),
  )
  quantity: number;

  @ApiProperty({ example: 180.25, description: 'Sell price per share' })
  @IsNumber()
  @Min(0.01)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? parseFloat(value) : (value as number),
  )
  sell_price: number;
}
