import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CustomersController } from './customers.controller';
import { CustomerServicesController } from './customer-services.controller';

import { CustomersService } from './customers.service';

import { Customer } from './entities/customer.entity';
import { CustomerService } from './entities/customer-service.entity';
import { CustomerKyc } from './entities/customer-kyc.entity';
import { CustomerDocument } from './entities/customer-document.entity';
import { CustomerAddress } from './entities/customer-address.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentAuditLog } from '../payments/entities/payment-audit-log.entity';
import { CustomerKycServiceUsage } from './entities/customer-kyc-service-usage.entity';
import { NodemailerEmailService } from './services/email.service';
// Payment related providers moved to PaymentsModule
import { PaymentsModule } from '../payments/payments.module';
import { SubscriptionSchedulerService } from './services/subscription-scheduler.service';
import { SubscriptionPackagesModule } from '../subscription-packages/subscription-packages.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionPackage } from '../subscription-packages/entities/subscription-package.entity';
import { getJwtConfig } from '../../config/jwt.config';
import { ServiceFundTransaction } from './entities/service-fund-transaction.entity';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      CustomerService,
      CustomerKyc,
      CustomerDocument,
      CustomerAddress,
      SubscriptionPackage,
      PasswordReset,
      Payment,
      PaymentAuditLog,
      CustomerKycServiceUsage,
      ServiceFundTransaction,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: getJwtConfig,
      inject: [ConfigService],
    }),
    PaymentsModule,
    SubscriptionPackagesModule,
    NotificationsModule,
    CouponsModule,
  ],
  controllers: [CustomersController, CustomerServicesController],
  providers: [
    CustomersService,
    {
      provide: 'EmailService',
      useClass: NodemailerEmailService,
    },
    SubscriptionSchedulerService,
  ],
  exports: [CustomersService],
})
export class CustomersModule { }
