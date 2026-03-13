import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { Wallet } from './entities/wallet.entity';
import { TransferHistory } from '../transfer-history/entities/transfer-history.entity';
import { CustomerService } from '../customers/entities/customer-service.entity';
import { InvestmentInfoModule } from '../investment-info/investment-info.module';
import { CustomersModule } from '../customers/customers.module';
import { RequiredServiceGuard } from '../../common/guards/required-service.guard';
import { Customer } from '../customers/entities/customer.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, TransferHistory, CustomerService, Customer]),
    InvestmentInfoModule,
    CustomersModule,
    NotificationsModule,
  ],
  controllers: [WalletsController],
  providers: [WalletsService, RequiredServiceGuard],
  exports: [WalletsService],
})
export class WalletsModule {}
