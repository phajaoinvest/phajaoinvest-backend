import {
  IsNotEmpty,
  IsNumber,
  IsUUID,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PlacePaperTradeDto {
  @ApiProperty({
    example: '11111111-2222-3333-4444-555555555555',
    description: 'Stock ID to paper-trade',
  })
  @IsUUID()
  @IsNotEmpty()
  stock_id: string;

  @ApiProperty({
    example: 1000,
    description: 'Investment amount for the paper trade',
  })
  @IsNumber()
  @Min(1)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? parseFloat(value) : (value as number),
  )
  investment_amount: number;
}
