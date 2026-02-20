import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getDatabaseConfig } from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { StocksModule } from './modules/stocks/stocks.module';
import { InvestTypesModule } from './modules/invest-types/invest-types.module';
import { StockCategoriesModule } from './modules/stock-categories/stock-categories.module';
import { BoundsModule } from './modules/bounds/bounds.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { CustomerStocksModule } from './modules/customer-stocks/customer-stocks.module';
import { CustomersModule } from './modules/customers/customers.module';
import { StockPicksModule } from './modules/stock-picks/stock-picks.module';
// import { InteractiveBrokersModule } from './modules/interactive-brokers/interactive-brokers.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { RolesModule } from './modules/roles/roles.module';
import { StockTransactionsModule } from './modules/stock-transactions/stock-transactions.module';
import { TransferHistoryModule } from './modules/transfer-history/transfer-history.module';
import { UsersModule } from './modules/users/users.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { DemoModule } from './demo/demo.module';
import { CountryModule } from './modules/country/country.module';
import { ProvinceModule } from './modules/province/province.module';
import { DistrictModule } from './modules/district/district.module';
import { InvestmentInfoModule } from './modules/investment-info/investment-info.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SettingsModule } from './modules/settings/settings.module';
import { CouponsModule } from './modules/coupons/coupons.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getDatabaseConfig,
      inject: [ConfigService],
    }),
    NotificationsModule,
    CouponsModule,
    AuthModule,
    StocksModule,
    InvestTypesModule,
    StockCategoriesModule,
    BoundsModule,
    AuditLogsModule,
    CustomerStocksModule,
    CustomersModule,
    StockPicksModule,
    // InteractiveBrokersModule,
    PermissionsModule,
    RolesModule,
    StockTransactionsModule,
    TransferHistoryModule,
    UsersModule,
    WalletsModule,
    DemoModule,
    CountryModule,
    ProvinceModule,
    DistrictModule,
    InvestmentInfoModule,
    DashboardModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
