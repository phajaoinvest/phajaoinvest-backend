import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaperTradesController } from './paper-trades.controller';
import { PaperTradesService } from './paper-trades.service';
import { PaperTrade } from './entities/paper-trade.entity';
import { Stock } from '../stocks/entities/stock.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { StocksModule } from '../stocks/stocks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaperTrade, Stock, Wallet]),
    StocksModule,
  ],
  controllers: [PaperTradesController],
  providers: [PaperTradesService],
  exports: [PaperTradesService],
})
export class PaperTradesModule {}
