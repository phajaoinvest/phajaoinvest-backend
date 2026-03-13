import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { AdminNotificationsController } from './notifications.controller';
import { CustomerNotificationsController } from './customer-notifications.controller';
import { AdminPendingCountsController } from './admin-pending-counts.controller';
import { Notification } from './entities/notification.entity';
import { CustomerService } from '../customers/entities/customer-service.entity';
import { CustomerStockPick } from '../stock-picks/entities/customer-stock-pick.entity';
import { TransferHistory } from '../transfer-history/entities/transfer-history.entity';
import { InvestmentRequest } from '../investment-info/entities/investment-request.entity';
import { User } from '../users/entities/user.entity';
import { UserSettings } from '../settings/entities/user-settings.entity';
import { Customer } from '../customers/entities/customer.entity';

@Module({
  imports: [
    MailModule,
    TypeOrmModule.forFeature([
      Notification,
      CustomerService,
      CustomerStockPick,
      TransferHistory,
      InvestmentRequest,
      User,
      UserSettings,
      Customer,
    ]),
  ],
  providers: [NotificationsService, NotificationsGateway],
  controllers: [
    AdminNotificationsController,
    CustomerNotificationsController,
    AdminPendingCountsController,
  ],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
