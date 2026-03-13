import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan, LessThan, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { Customer } from './entities/customer.entity';
import { CustomerStatus } from '../../common/enums';
import {
  CustomerService,
  CustomerServiceType,
  SubscriptionStatus,
} from './entities/customer-service.entity';
import {
  CustomerKyc,
  KycLevel,
  KycStatus,
} from './entities/customer-kyc.entity';
import { CustomerKycServiceUsage } from './entities/customer-kyc-service-usage.entity';
import { CustomerAddress } from './entities/customer-address.entity';
import {
  CustomerDocument,
  CustomerDocumentType,
} from './entities/customer-document.entity';
import {
  PasswordReset,
  PasswordResetType,
  PasswordResetStatus,
} from './entities/password-reset.entity';
import {
  Payment,
  PaymentStatus,
  PaymentMethod,
  PaymentType,
} from '../payments/entities/payment.entity';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  PaginationUtil,
  PaginationOptions,
  PaginatedResult,
} from '../../common/utils/pagination.util';
import {
  ForgotPasswordDto,
  ResetPasswordWithOtpDto,
  ResetPasswordWithTokenDto,
  PasswordResetMethod,
} from './dto/password-reset.dto';
import type { EmailService } from './interfaces/email.interface';

import { SubscriptionDuration } from './entities/customer-service.entity';
import type { PaymentProvider } from './services/payment.service';
import { PaymentRecordService } from '../payments/services/payment-record.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildPremiumMembershipApplicationNotification,
  buildStockAccountApplicationNotification,
  buildGuaranteedReturnsApplicationNotification,
  buildPremiumMembershipApprovalNotification,
  buildStockAccountApprovalNotification,
  buildGuaranteedReturnsApprovalNotification,
  buildCouponRedemptionNotification,
  buildPaymentSlipSubmissionNotification,
} from '../notifications/utils/notification-builders';
import {
  PaymentAuditService,
  PaymentAuditContext,
} from '../payments/services/payment-audit.service';
import {
  PaymentAuditAction,
  PaymentAuditLevel,
} from '../payments/entities/payment-audit-log.entity';
import { SubscriptionPackagesService } from '../subscription-packages/subscription-packages.service';
import { CouponsService } from '../coupons/coupons.service';
import { SubscriptionPackage } from '../subscription-packages/entities/subscription-package.entity';
import {
  ServiceFundTransaction,
  ServiceFundTransactionType,
} from './entities/service-fund-transaction.entity';
import { TopupServiceDto, TransferFundsDto } from './dto/funds.dto';

type ServiceApplicationStatus = 'approved' | 'rejected' | 'pending' | 'not';

interface ServiceStatusSummary {
  service_type: CustomerServiceType;
  status: ServiceApplicationStatus;
  active: boolean;
  applied_at: Date | null;
  subscription_duration?: SubscriptionDuration | null;
  subscription_expires_at?: Date | null;
  payment_status?: PaymentStatus | null;
  payment_updated_at?: Date | null;
  kyc_status?: KycStatus | null;
  kyc_level?: KycLevel | null;
  kyc_reviewed_at?: Date | null;
}

export interface ServiceDetailKycInfo {
  kyc_id: string;
  kyc_status: KycStatus;
  kyc_level: KycLevel;
  dob: Date | null;
  nationality: string | null;
  marital_status: string | null;
  employment_status: string | null;
  annual_income: string | null; // Stored as string in database
  employer_name: string | null;
  occupation: string | null;
  investment_experience: number | null; // Stored as number in database
  dependent_number: number | null;
  source_of_funds: string | null;
  risk_tolerance: string | null;
  pep_flag: boolean | null;
  tax_id: string | null;
  fatca_status: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ServiceDetailPaymentInfo {
  payment_id: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  payment_method: PaymentMethod;
  payment_type: PaymentType;
  payment_slip_url: string | null;
  payment_slip_filename: string | null;
  payment_reference: string | null;
  admin_notes: string | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ServiceDetailPackageInfo {
  id: string;
  service_type: CustomerServiceType;
  duration_months: number;
  price: number;
  currency: string;
  description: string | null;
  features: string[] | null;
}

export interface PendingPremiumMembership {
  service_id: string;
  customer_id: string;
  customer_info: {
    username: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  service_type: CustomerServiceType;
  subscription_duration: SubscriptionDuration | null;
  subscription_fee: number | null;
  applied_at: Date;
  payment_info: {
    payment_id: string;
    amount: number;
    paid_at: Date;
    status: PaymentStatus;
    payment_slip_url?: string;
  };
}

export interface PremiumMembershipSubscription {
  service_id: string;
  customer_id: string;
  customer_info: {
    username: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  service_type: CustomerServiceType;
  active: boolean;
  subscription_duration: SubscriptionDuration | null;
  subscription_fee: number | null;
  subscription_expires_at: Date | null;
  subscription_package_id: string | null;
  applied_at: Date;
  latest_payment_status?: PaymentStatus | null;
  status: SubscriptionStatus;
}

export interface PremiumMembershipDetail {
  service: {
    id: string;
    service_type: CustomerServiceType;
    status: SubscriptionStatus;
    active: boolean;
    requires_payment: boolean;
    applied_at: Date;
    subscription_duration: SubscriptionDuration | null;
    subscription_fee: number | null;
    subscription_expires_at: Date | null;
    subscription_package_id: string | null;
    balance: number;
    invested_amount: number;
    kyc_id: string | null;
  };
  customer: {
    id: string;
    username: string;
    email: string;
    first_name: string;
    last_name: string | null;
    phone_number: string | null;
    status: CustomerStatus;
    isVerify: boolean;
    profile: string | null;
    created_at: Date;
    updated_at: Date;
  };
  package: {
    id: string;
    service_type: CustomerServiceType;
    duration_months: number;
    price: number;
    currency: string;
    description: string | null;
    features: string[] | null;
    active: boolean;
  } | null;
  addresses: Array<{
    id: string;
    address_line: string | null;
    village: string | null;
    postal_code: string | null;
    country_id: string | null;
    province_id: string | null;
    district_id: string | null;
    is_primary: boolean;
    created_at: Date;
  }>;
  payments: Array<{
    id: string;
    status: PaymentStatus;
    amount: number;
    currency: string;
    payment_method: PaymentMethod;
    payment_type: PaymentType;
    description: string | null;
    payment_slip_url: string | null;
    payment_slip_filename: string | null;
    payment_reference: string | null;
    admin_notes: string | null;
    paid_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>;
}

export interface PendingInternationalStockAccount {
  service_id: string;
  customer_id: string;
  customer_info: {
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    phone_number?: string;
  };
  service_type: CustomerServiceType;
  active: boolean;
  requires_payment: boolean;
  applied_at: Date;
  kyc_info?: {
    kyc_id: string;
    kyc_level: KycLevel;
    kyc_status: KycStatus;
    reviewed_at: Date | null;
  };
}

export interface PendingGuaranteedReturn {
  service_id: string;
  customer_id: string;
  customer_info: {
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    phone_number?: string;
  };
  service_type: CustomerServiceType;
  active: boolean;
  requires_payment: boolean;
  invested_amount: number | null;
  balance: number | null;
  applied_at: Date;
  kyc_info?: {
    kyc_id: string;
    kyc_level: KycLevel;
    kyc_status: KycStatus;
    reviewed_at: Date | null;
  };
  payment_info?: {
    payment_id: string;
    amount: number;
    paid_at: Date | null;
    status: PaymentStatus;
    payment_slip_url?: string;
  };
}

export interface PendingService {
  service_id: string;
  customer_id: string;
  customer_info: {
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    phone_number?: string;
  };
  service_type: CustomerServiceType;
  active: boolean;
  requires_payment: boolean;
  subscription_duration: SubscriptionDuration | null;
  subscription_fee: number | null;
  subscription_expires_at: Date | null;
  invested_amount: number | null;
  balance: number | null;
  applied_at: Date;
  kyc_info?: {
    kyc_id: string;
    kyc_level: KycLevel;
    kyc_status: KycStatus;
    reviewed_at: Date | null;
  };
  payment_info?: {
    payment_id: string;
    amount: number;
    paid_at: Date | null;
    status: PaymentStatus;
    payment_slip_url?: string;
  };
}

export interface ServiceTypeStats {
  service_type: CustomerServiceType;
  total_pending: number;
  pending_with_payment: number;
  pending_kyc_review: number;
  approved_this_month: number;
  rejected_this_month: number;
  avg_approval_time_hours: number | null;
}

export interface ServiceStats {
  by_service: ServiceTypeStats[];
  total_pending: number;
  total_active: number;
}

export interface CustomerWithServices {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  phone_number: string | null;
  status: CustomerStatus;
  isVerify: boolean;
  profile: string | null;
  created_at: Date;
  updated_at: Date;
  services: ServiceStatusSummary[];
}

interface CreateCustomerDto {
  username: string;
  email: string;
  password: string;
}
interface UpdateCustomerDto {
  username?: string;
  email?: string;
  password?: string;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly repo: Repository<Customer>,
    @InjectRepository(CustomerService)
    private readonly customerServiceRepo: Repository<CustomerService>,
    @InjectRepository(CustomerKyc)
    private readonly customerKycRepo: Repository<CustomerKyc>,
    @InjectRepository(CustomerAddress)
    private readonly customerAddressRepo: Repository<CustomerAddress>,
    @InjectRepository(SubscriptionPackage)
    private readonly subscriptionPackageRepo: Repository<SubscriptionPackage>,
    @InjectRepository(CustomerDocument)
    private readonly customerDocumentRepo: Repository<CustomerDocument>,
    @InjectRepository(PasswordReset)
    private readonly passwordResetRepo: Repository<PasswordReset>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly subscriptionPackagesService: SubscriptionPackagesService,
    @InjectRepository(ServiceFundTransaction)
    private readonly serviceFundTxRepo: Repository<ServiceFundTransaction>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    @Inject('EmailService')
    private readonly emailService: EmailService,
    @Inject('PaymentService')
    private readonly paymentService: PaymentProvider,
    private readonly paymentRecordService: PaymentRecordService,
    private readonly paymentAuditService: PaymentAuditService,
    private readonly couponsService: CouponsService,
    private readonly notificationsService: NotificationsService,
  ) { }

  async create(dto: CreateCustomerDto) {
    const entity = this.repo.create(dto);
    const saved = await this.repo.save(entity);
    // Fetch without password
    return this.findOne(saved.id);
  }

  async getStats() {
    const totalCustomers = await this.repo.count();
    const activeCount = await this.repo.count({
      where: { status: CustomerStatus.ACTIVE },
    });
    const inactiveCount = await this.repo.count({
      where: { status: CustomerStatus.INACTIVE },
    });
    const suspendedCount = await this.repo.count({
      where: { status: CustomerStatus.SUSPENDED },
    });

    return {
      totalCustomers,
      activeCount,
      inactiveCount,
      suspendedCount,
    };
  }

  async findAll(
    query: PaginationQueryDto & {
      search?: string;
      status?: CustomerStatus;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const { page, limit, skip } = PaginationUtil.calculatePagination({
      page: query.page,
      limit: query.limit,
      defaultLimit: 10,
      maxLimit: 100,
    });

    const queryBuilder = this.repo.createQueryBuilder('customer');

    // Apply search filter
    if (query.search) {
      queryBuilder.where(
        '(customer.first_name ILIKE :search OR customer.last_name ILIKE :search OR customer.email ILIKE :search OR customer.username ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    // Apply status filter
    if (query.status) {
      queryBuilder.andWhere('customer.status = :status', {
        status: query.status,
      });
    }

    // Apply date range filter
    if (query.startDate) {
      queryBuilder.andWhere('customer.created_at >= :startDate', {
        startDate: query.startDate,
      });
    }
    if (query.endDate) {
      queryBuilder.andWhere('customer.created_at <= :endDate', {
        endDate: query.endDate,
      });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination and get data (exclude password)
    const data = await queryBuilder
      .select([
        'customer.id',
        'customer.first_name',
        'customer.last_name',
        'customer.username',
        'customer.email',
        'customer.phone_number',
        'customer.status',
        'customer.isVerify',
        'customer.profile',
        'customer.deleted_by',
        'customer.created_at',
        'customer.updated_at',
      ])
      .skip(skip)
      .take(limit)
      .orderBy('customer.created_at', 'DESC')
      .getMany();

    // Fetch services for each customer
    const customerIds = data.map((c) => c.id);
    const services =
      customerIds.length > 0
        ? await this.customerServiceRepo.find({
          where: { customer_id: In(customerIds), active: true },
          select: [
            'id',
            'customer_id',
            'service_type',
            'active',
            'applied_at',
          ],
        })
        : [];

    // Group services by customer
    const servicesByCustomer = new Map<string, any[]>();
    services.forEach((service) => {
      const existing = servicesByCustomer.get(service.customer_id) || [];
      existing.push(service);
      servicesByCustomer.set(service.customer_id, existing);
    });

    // Attach services to customers
    const dataWithServices = data.map((customer) => ({
      ...customer,
      services: servicesByCustomer.get(customer.id) || [],
    }));

    return PaginationUtil.createPaginatedResult(dataWithServices, total, {
      page,
      limit,
    });
  }

  async findOne(id: string) {
    const entity = await this.repo.findOne({
      where: { id },
      select: [
        'id',
        'first_name',
        'last_name',
        'username',
        'email',
        'phone_number',
        'status',
        'isVerify',
        'profile',
        'deleted_by',
        'created_at',
        'updated_at',
      ],
    });
    if (!entity) throw new NotFoundException('Customer not found');
    return entity;
  }

  async findOneWithServices(id: string): Promise<CustomerWithServices> {
    const entity = await this.repo.findOne({
      where: { id },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        username: true,
        email: true,
        phone_number: true,
        status: true,
        isVerify: true,
        profile: true,
        created_at: true,
        updated_at: true,
        // Explicitly exclude password field
      },
    });
    if (!entity) throw new NotFoundException('Customer not found');

    const trackedServiceTypes: CustomerServiceType[] = [
      CustomerServiceType.INTERNATIONAL_STOCK_ACCOUNT,
      CustomerServiceType.GUARANTEED_RETURNS,
      CustomerServiceType.PREMIUM_MEMBERSHIP,
      CustomerServiceType.PREMIUM_STOCK_PICKS,
    ];

    const allServices = await this.customerServiceRepo.find({
      where: { customer_id: id },
      order: { applied_at: 'DESC' },
    });

    const latestServiceByType = new Map<CustomerServiceType, CustomerService>();
    for (const service of allServices) {
      if (!trackedServiceTypes.includes(service.service_type)) continue;
      if (!latestServiceByType.has(service.service_type)) {
        latestServiceByType.set(service.service_type, service);
      }
    }

    const kycIds = allServices
      .map((svc) => svc.kyc_id)
      .filter((kycId): kycId is string => Boolean(kycId));
    const uniqueKycIds = Array.from(new Set(kycIds));
    const kycRecordsById = new Map<string, CustomerKyc>();
    if (uniqueKycIds.length) {
      const kycs = await this.customerKycRepo.find({
        where: { id: In(uniqueKycIds) },
      });
      kycs.forEach((record) => kycRecordsById.set(record.id, record));
    }

    const latestKycByLevel = new Map<KycLevel, CustomerKyc | null>();
    const getLatestKycForLevel = async (level: KycLevel) => {
      if (latestKycByLevel.has(level)) {
        return latestKycByLevel.get(level) ?? null;
      }
      const record = await this.customerKycRepo.findOne({
        where: { customer_id: id, kyc_level: level },
        order: { created_at: 'DESC' },
      });
      latestKycByLevel.set(level, record ?? null);
      return record ?? null;
    };

    const mapKycStatusToService = (
      status?: KycStatus | null,
    ): ServiceApplicationStatus => {
      if (!status) return 'pending';
      switch (status) {
        case KycStatus.APPROVED:
          return 'approved';
        case KycStatus.REJECTED:
          return 'rejected';
        case KycStatus.PENDING:
        case KycStatus.EXPIRED:
        default:
          return 'pending';
      }
    };

    const mapPaymentStatusToService = (
      status?: PaymentStatus | null,
      active?: boolean,
    ): ServiceApplicationStatus => {
      if (!status) {
        return active ? 'approved' : 'pending';
      }
      switch (status) {
        case PaymentStatus.SUCCEEDED:
          return 'approved';
        case PaymentStatus.PENDING:
        case PaymentStatus.PAYMENT_SLIP_SUBMITTED:
        case PaymentStatus.PROCESSING:
          return 'pending';
        case PaymentStatus.FAILED:
        case PaymentStatus.CANCELED:
        case PaymentStatus.REFUNDED:
        case PaymentStatus.PARTIALLY_REFUNDED:
        default:
          return 'rejected';
      }
    };

    const buildPremiumSummary = async (
      serviceRecord: CustomerService | null,
    ): Promise<ServiceStatusSummary> => {
      if (!serviceRecord) {
        return {
          service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
          status: 'not',
          active: false,
          applied_at: null,
          subscription_duration: null,
          subscription_expires_at: null,
          payment_status: null,
          payment_updated_at: null,
        };
      }

      const latestPayment = await this.paymentRepo.findOne({
        where: { service_id: serviceRecord.id },
        order: { created_at: 'DESC' },
      });

      const status = mapPaymentStatusToService(
        latestPayment?.status,
        serviceRecord.active,
      );

      const paymentUpdatedAt =
        latestPayment?.approved_at ??
        latestPayment?.payment_slip_submitted_at ??
        latestPayment?.updated_at ??
        latestPayment?.created_at ??
        null;

      return {
        service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
        status,
        active: serviceRecord.active,
        applied_at: serviceRecord.applied_at,
        subscription_duration: serviceRecord.subscription_duration,
        subscription_expires_at: serviceRecord.subscription_expires_at,
        payment_status: latestPayment?.status ?? null,
        payment_updated_at: paymentUpdatedAt,
      };
    };

    const buildKycDrivenSummary = async (
      serviceType: CustomerServiceType,
      serviceRecord: CustomerService | null,
    ): Promise<ServiceStatusSummary> => {
      const requiredLevel = this.requiredConfig[serviceType].level;

      if (!serviceRecord) {
        return {
          service_type: serviceType,
          status: 'not',
          active: false,
          applied_at: null,
          kyc_status: null,
          kyc_level: requiredLevel,
          kyc_reviewed_at: null,
        };
      }

      let kycRecord: CustomerKyc | null = null;
      if (serviceRecord.kyc_id) {
        kycRecord = kycRecordsById.get(serviceRecord.kyc_id) ?? null;
        if (!kycRecord) {
          kycRecord = await this.customerKycRepo.findOne({
            where: { id: serviceRecord.kyc_id },
          });
          if (kycRecord) {
            kycRecordsById.set(kycRecord.id, kycRecord);
          }
        }
      }

      if (!kycRecord) {
        kycRecord = await getLatestKycForLevel(requiredLevel);
      }

      const status = kycRecord
        ? mapKycStatusToService(kycRecord.status)
        : serviceRecord.active
          ? 'approved'
          : ('pending' as ServiceApplicationStatus);

      let kycReviewedAt: Date | null = null;
      if (kycRecord) {
        kycReviewedAt =
          kycRecord.reviewed_at ??
          kycRecord.updated_at ??
          kycRecord.created_at ??
          null;
      }

      return {
        service_type: serviceType,
        status,
        active: serviceRecord.active,
        applied_at: serviceRecord.applied_at,
        kyc_status: kycRecord?.status ?? null,
        kyc_level: kycRecord?.kyc_level ?? requiredLevel,
        kyc_reviewed_at: kycReviewedAt,
      };
    };

    const serviceSummaries: ServiceStatusSummary[] = await Promise.all(
      trackedServiceTypes.map(async (serviceType) => {
        const serviceRecord = latestServiceByType.get(serviceType) ?? null;
        if (serviceType === CustomerServiceType.PREMIUM_MEMBERSHIP) {
          return buildPremiumSummary(serviceRecord);
        }
        return buildKycDrivenSummary(serviceType, serviceRecord);
      }),
    );

    return {
      ...entity,
      services: serviceSummaries,
    };
  }

  async getPaymentHistory(
    customerId: string,
    options?: {
      status?: PaymentStatus;
      payment_type?: PaymentType;
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    },
  ) {
    return this.paymentRecordService.getPaymentHistory(customerId, options);
  }

  /**
   * Get comprehensive customer details for admin review
   * Includes: basic info, KYC records, documents, addresses, and services
   */
  async getCustomerDetailedForAdmin(
    customerId: string,
    serviceType?: CustomerServiceType,
  ) {
    // Get customer basic info
    const customer = await this.repo.findOne({
      where: { id: customerId },
      select: [
        'id',
        'username',
        'email',
        'first_name',
        'last_name',
        'phone_number',
        'profile',
        'status',
        'isVerify',
        'created_at',
        'updated_at',
      ],
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Get KYC records - filter by service type if provided
    let kycRecords: CustomerKyc[];
    if (serviceType) {
      // Get KYC records associated with the specific service type
      const services = await this.customerServiceRepo.find({
        where: { customer_id: customerId, service_type: serviceType },
      });
      const kycIds = services
        .map((s) => s.kyc_id)
        .filter((id): id is string => id !== null);

      if (kycIds.length > 0) {
        kycRecords = await this.customerKycRepo.find({
          where: { id: In(kycIds) },
          order: { created_at: 'DESC' },
        });
      } else {
        kycRecords = [];
      }
    } else {
      kycRecords = await this.customerKycRepo.find({
        where: { customer_id: customerId },
        order: { created_at: 'DESC' },
      });
    }

    // Get documents - filter by service-related KYC if service type is provided
    let documents: CustomerDocument[];
    if (serviceType && kycRecords.length > 0) {
      const kycIds = kycRecords.map((kyc) => kyc.id);
      documents = await this.customerDocumentRepo.find({
        where: { customer_id: customerId, kyc_id: In(kycIds) },
        order: { created_at: 'DESC' },
      });
    } else if (serviceType) {
      documents = [];
    } else {
      documents = await this.customerDocumentRepo.find({
        where: { customer_id: customerId },
        order: { created_at: 'DESC' },
      });
    }

    // Get all addresses
    const addresses = await this.customerAddressRepo.find({
      where: { customer_id: customerId },
      order: { created_at: 'DESC' },
    });

    // Get all services
    const services = await this.customerServiceRepo.find({
      where: { customer_id: customerId },
      order: { applied_at: 'DESC' },
    });

    return {
      id: customer.id,
      username: customer.username,
      email: customer.email,
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone_number: customer.phone_number,
      profile: customer.profile,
      status: customer.status,
      isVerify: customer.isVerify,
      created_at: customer.created_at,
      updated_at: customer.updated_at,
      kyc_records: kycRecords.map((kyc) => ({
        id: kyc.id,
        kyc_level: kyc.kyc_level,
        status: kyc.status,
        dob: kyc.dob,
        nationality: kyc.nationality,
        marital_status: kyc.marital_status,
        employment_status: kyc.employment_status,
        annual_income: kyc.annual_income,
        employer_name: kyc.employer_name,
        occupation: kyc.occupation,
        investment_experience: kyc.investment_experience,
        dependent_number: kyc.dependent_number,
        source_of_funds: kyc.source_of_funds,
        risk_tolerance: kyc.risk_tolerance,
        pep_flag: kyc.pep_flag,
        tax_id: kyc.tax_id,
        fatca_status: kyc.fatca_status,
        submitted_at: kyc.submitted_at,
        reviewed_at: kyc.reviewed_at,
        reviewed_by: kyc.reviewed_by,
        rejection_reason: kyc.rejection_reason,
        created_at: kyc.created_at,
        updated_at: kyc.updated_at,
      })),
      documents: documents.map((doc) => ({
        id: doc.id,
        doc_type: doc.doc_type,
        storage_ref: doc.storage_ref,
        kyc_id: doc.kyc_id,
        metadata: doc.metadata,
        created_at: doc.created_at,
      })),
      addresses: addresses.map((addr) => ({
        id: addr.id,
        address_line: addr.address_line,
        village: addr.village,
        postal_code: addr.postal_code,
        country_id: addr.country_id,
        province_id: addr.province_id,
        district_id: addr.district_id,
        is_primary: addr.is_primary,
        created_at: addr.created_at,
      })),
      services: services.map((service) => ({
        service_id: service.id,
        service_type: service.service_type,
        active: service.active,
        status: service.status,
        subscription_duration: service.subscription_duration,
        subscription_fee: service.subscription_fee,
        subscription_expires_at: service.subscription_expires_at,
        invested_amount: service.invested_amount,
        balance: service.balance,
        applied_at: service.applied_at,
        kyc_id: service.kyc_id,
      })),
    };
  }

  async update(id: string, dto: UpdateCustomerDto) {
    // Fetch with password for update
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Customer not found');
    Object.assign(entity, dto);
    await this.repo.save(entity);
    // Return without password
    return this.findOne(id);
  }

  async updateStatus(id: string, status: CustomerStatus) {
    // Fetch with password for update
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Customer not found');
    entity.status = status;
    await this.repo.save(entity);
    // Return without password
    return this.findOne(id);
  }

  async remove(id: string) {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
  }

  // --- Service Application Logic ---

  private calculateSubscriptionFee(
    serviceType: CustomerServiceType,
    duration: SubscriptionDuration,
  ): number {
    // Define pricing for different services and durations
    const pricing: Record<
      CustomerServiceType,
      Record<SubscriptionDuration, number>
    > = {
      [CustomerServiceType.PREMIUM_MEMBERSHIP]: {
        [SubscriptionDuration.THREE_MONTHS]: 299.99,
        [SubscriptionDuration.SIX_MONTHS]: 549.99,
        [SubscriptionDuration.TWELVE_MONTHS]: 999.99,
      },
      [CustomerServiceType.PREMIUM_STOCK_PICKS]: {
        [SubscriptionDuration.THREE_MONTHS]: 0,
        [SubscriptionDuration.SIX_MONTHS]: 0,
        [SubscriptionDuration.TWELVE_MONTHS]: 0,
      },
      [CustomerServiceType.INTERNATIONAL_STOCK_ACCOUNT]: {
        [SubscriptionDuration.THREE_MONTHS]: 0,
        [SubscriptionDuration.SIX_MONTHS]: 0,
        [SubscriptionDuration.TWELVE_MONTHS]: 0,
      },
      [CustomerServiceType.GUARANTEED_RETURNS]: {
        [SubscriptionDuration.THREE_MONTHS]: 0,
        [SubscriptionDuration.SIX_MONTHS]: 0,
        [SubscriptionDuration.TWELVE_MONTHS]: 0,
      },
    };

    return pricing[serviceType][duration] || 0;
  }

  private kycLevelOrder(level: KycLevel): number {
    switch (level) {
      case KycLevel.BASIC:
        return 1;
      case KycLevel.ADVANCED:
        return 2;
      case KycLevel.BROKERAGE:
        return 3;
      default:
        return 0;
    }
  }

  private requiredConfig: Record<
    CustomerServiceType,
    {
      level: KycLevel;
      requiredFields: (keyof CustomerKyc)[];
      requiredDocs: CustomerDocumentType[];
      requiresPayment?: boolean;
      requiresAdminApproval?: boolean;
      subscriptionBased?: boolean;
      autoApprove?: boolean; // Auto-approve without KYC requirements
    }
  > = {
      [CustomerServiceType.PREMIUM_MEMBERSHIP]: {
        level: KycLevel.BASIC,
        requiredFields: [],
        requiredDocs: [],
        requiresPayment: true,
        requiresAdminApproval: true,
        subscriptionBased: true,
      },
      [CustomerServiceType.PREMIUM_STOCK_PICKS]: {
        level: KycLevel.BASIC,
        requiredFields: [],
        requiredDocs: [],
        requiresPayment: false,
        requiresAdminApproval: false,
        subscriptionBased: false,
        autoApprove: true, // Auto-approve without KYC for new customers
      },
      [CustomerServiceType.INTERNATIONAL_STOCK_ACCOUNT]: {
        level: KycLevel.BROKERAGE,
        requiredFields: [
          'dob',
          'nationality',
          'employment_status',
          'annual_income',
          'investment_experience',
          'source_of_funds',
          'risk_tolerance',
        ],
        requiredDocs: [
          CustomerDocumentType.IDENTITY_FRONT,
          CustomerDocumentType.IDENTITY_BACK,
          CustomerDocumentType.BANK_STATEMENT,
        ],
        requiresAdminApproval: true, // Requires admin approval after KYC submission
      },
      [CustomerServiceType.GUARANTEED_RETURNS]: {
        level: KycLevel.ADVANCED,
        requiredFields: [
          'dob',
          'nationality',
          'employment_status',
          'annual_income',
          'investment_experience',
        ],
        requiredDocs: [
          CustomerDocumentType.IDENTITY_FRONT,
          CustomerDocumentType.IDENTITY_BACK,
          CustomerDocumentType.BANK_STATEMENT,
        ],
        requiresAdminApproval: true, // Requires admin approval after KYC submission
      },
    };

  async listServices(customerId: string) {
    return this.customerServiceRepo.find({
      where: { customer_id: customerId },
    });
  }

  async topupInternationalAccount(
    customerId: string,
    serviceId: string,
    dto: TopupServiceDto,
  ) {
    if (dto.amount <= 0) throw new BadRequestException('Amount must be > 0');
    return this.dataSource.transaction(async (manager) => {
      const service = await manager.findOne(this.customerServiceRepo.target, {
        where: { id: serviceId, customer_id: customerId },
      });
      if (!service) throw new NotFoundException('Service not found');
      const isIntl =
        service.service_type ===
        CustomerServiceType.INTERNATIONAL_STOCK_ACCOUNT;
      if (!isIntl) {
        throw new BadRequestException(
          'Service is not an international stock account',
        );
      }
      if (!service.active)
        throw new BadRequestException('Service is not active');
      service.balance = Number(service.balance) + dto.amount;
      await manager.save(service);
      const tx = this.serviceFundTxRepo.create({
        customer_id: customerId,
        to_service_id: service.id,
        tx_type: ServiceFundTransactionType.TOPUP,
        amount: dto.amount,
        reference: dto.reference || null,
        description: 'International account top-up',
      });
      await manager.save(tx);
      return {
        service_id: service.id,
        balance: service.balance,
        transaction_id: tx.id,
      };
    });
  }

  async transferToGuaranteedReturns(customerId: string, dto: TransferFundsDto) {
    if (dto.amount <= 0) throw new BadRequestException('Amount must be > 0');
    if (dto.from_service_id === dto.to_service_id) {
      throw new BadRequestException(
        'from_service_id and to_service_id must differ',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const from = await manager.findOne(this.customerServiceRepo.target, {
        where: { id: dto.from_service_id, customer_id: customerId },
      });
      const to = await manager.findOne(this.customerServiceRepo.target, {
        where: { id: dto.to_service_id, customer_id: customerId },
      });
      if (!from || !to)
        throw new NotFoundException('Source or destination service not found');
      if (
        from.service_type !== CustomerServiceType.INTERNATIONAL_STOCK_ACCOUNT
      ) {
        throw new BadRequestException(
          'Source must be INTERNATIONAL_STOCK_ACCOUNT',
        );
      }
      if (to.service_type !== CustomerServiceType.GUARANTEED_RETURNS) {
        throw new BadRequestException('Destination must be GUARANTEED_RETURNS');
      }
      if (!from.active || !to.active)
        throw new BadRequestException('Both services must be active');
      if (Number(from.balance) < dto.amount) {
        throw new BadRequestException(
          'Insufficient balance in international account',
        );
      }
      from.balance = Number(from.balance) - dto.amount;
      to.invested_amount = Number(to.invested_amount) + dto.amount;
      await manager.save(from);
      await manager.save(to);
      const tx = this.serviceFundTxRepo.create({
        customer_id: customerId,
        from_service_id: from.id,
        to_service_id: to.id,
        tx_type: ServiceFundTransactionType.TRANSFER,
        amount: dto.amount,
        reference: dto.reference || null,
        description: 'Transfer international -> guaranteed returns',
      });
      await manager.save(tx);
      return {
        from_service_id: from.id,
        to_service_id: to.id,
        new_source_balance: from.balance,
        new_destination_invested_amount: to.invested_amount,
        transaction_id: tx.id,
      };
    });
  }

  async applyService(
    customerId: string,
    serviceType: CustomerServiceType,
    payload?: {
      kyc?: Partial<CustomerKyc>;
      address?: {
        country_id?: string;
        province_id?: string;
        district_id?: string;
        village?: string;
        address_line?: string;
        postal_code?: string;
      };
      documents?: {
        doc_type: CustomerDocumentType;
        storage_ref: string;
        checksum?: string;
      }[];
      subscription?: {
        duration: SubscriptionDuration;
        fee?: number;
      };
    },
  ) {
    // 1. Early idempotency check (outside transaction for fast path)
    // const existing = await this.customerServiceRepo.findOne({
    //   where: { customer_id: customerId, service_type: serviceType },
    //   order: { applied_at: 'DESC' }, // Get the most recent application
    // });
    // console.log({ existing });
    // if (existing) {
    //   if (existing.active) {
    //     return { service: existing, status: 'already_active' };
    //   } else if (
    //     !existing.active &&
    //     existing.status === SubscriptionStatus.PENDING
    //   ) {
    //     return { service: existing, status: 'pending_admin_approval' };
    //   }
    //   // If status is CANCELLED, SUSPENDED, or EXPIRED (rejected), allow reapplication
    //   // The transaction will handle cleanup/creation of new service record
    // }

    // 2. Configuration lookup
    const cfg = this.requiredConfig[serviceType];
    if (!cfg) throw new BadRequestException('Unsupported service');

    // 3. KYC Handling Strategy
    // If payload.kyc provided -> create NEW KYC (APPROVED if autoApprove else PENDING)
    // If NOT provided AND service requires KYC (required fields/docs + admin approval without payment)
    //    -> duplicate latest APPROVED KYC (meeting or exceeding required level) into a NEW PENDING KYC
    //       and (if no new documents supplied) clone required (or all) documents.
    // If NOT provided AND no KYC needed -> skip creating KYC.

    const serviceNeedsKyc =
      (cfg.requiredFields.length > 0 || cfg.requiredDocs.length > 0) &&
      cfg.requiresAdminApproval &&
      !cfg.requiresPayment;

    // 6. Transactional execution to ensure atomicity for all writes
    return this.dataSource.transaction(async (manager) => {
      // Re-check for race condition inside transaction (another tx may have created it)
      const existingInside = await manager
        .getRepository(CustomerService)
        .findOne({
          where: { customer_id: customerId, service_type: serviceType },
          order: { applied_at: 'DESC' },
        });

      if (existingInside) {
        // If service is active, prevent duplicate
        if (existingInside.active) {
          return { service: existingInside, status: 'already_active' };
        }
        // If service is pending approval, return existing
        if (existingInside.status === SubscriptionStatus.PENDING) {
          return { service: existingInside, status: 'pending_admin_approval' };
        }
        // If service was rejected/cancelled/suspended, delete it to allow fresh application
        // This ensures clean state for reapplication
        if (
          existingInside.status === SubscriptionStatus.CANCELLED ||
          existingInside.status === SubscriptionStatus.SUSPENDED ||
          existingInside.status === SubscriptionStatus.EXPIRED
        ) {
          await manager.getRepository(CustomerService).remove(existingInside);
          this.logger.log(
            `Removed rejected/cancelled service ${existingInside.id} for customer ${customerId} to allow reapplication`,
          );
        }
      }

      // (a) KYC creation / duplication (optional)
      let kycRecord: CustomerKyc | null = null;
      let duplicatedFromKycId: string | null = null;
      const kycRepoTx = manager.getRepository(CustomerKyc);
      const docRepoTx = manager.getRepository(CustomerDocument);

      if (payload?.kyc) {
        // Fresh KYC data provided
        if (cfg.autoApprove) {
          kycRecord = kycRepoTx.create({
            customer_id: customerId,
            kyc_level: cfg.level,
            status: KycStatus.APPROVED,
            submitted_at: new Date(),
            reviewed_at: new Date(),
            reviewed_by: null,
            ...payload.kyc,
          });
        } else {
          kycRecord = kycRepoTx.create({
            customer_id: customerId,
            kyc_level: cfg.level,
            status: KycStatus.PENDING,
            submitted_at: new Date(),
            ...payload.kyc,
          });
        }
        kycRecord = await kycRepoTx.save(kycRecord);
      } else if (serviceNeedsKyc) {
        // No KYC input but service requires KYC
        // Check if there's a rejected service application for THIS specific service type
        // If so, customer must provide new KYC data to reapply
        const rejectedServiceForType = await manager
          .getRepository(CustomerService)
          .findOne({
            where: {
              customer_id: customerId,
              service_type: serviceType,
              status: SubscriptionStatus.CANCELLED,
            },
            order: { applied_at: 'DESC' },
            relations: ['kyc'],
          });

        if (rejectedServiceForType?.kyc_id) {
          const rejectedKyc = await kycRepoTx.findOne({
            where: { id: rejectedServiceForType.kyc_id },
          });

          if (rejectedKyc && rejectedKyc.status === KycStatus.REJECTED) {
            // The KYC for this specific service was rejected - require fresh submission
            throw new BadRequestException(
              `Your previous ${serviceType} application was rejected. Reason: ${rejectedKyc.rejection_reason || 'Not specified'}. Please submit updated KYC information and documents to reapply.`,
            );
          }
        }

        // Attempt duplication of prior approved KYC (for different service or first-time with approved KYC)
        const approvedKycs = await kycRepoTx.find({
          where: { customer_id: customerId, status: KycStatus.APPROVED },
          order: { created_at: 'DESC' },
          take: 5,
        });
        const source =
          approvedKycs.find(
            (k) =>
              this.kycLevelOrder(k.kyc_level) >= this.kycLevelOrder(cfg.level),
          ) || approvedKycs[0];

        if (!source) {
          throw new BadRequestException(
            'KYC information required but no existing approved KYC found. Please submit KYC data.',
          );
        }

        duplicatedFromKycId = source.id;

        const cloneFields: Partial<CustomerKyc> = {
          dob: source.dob,
          nationality: source.nationality,
          // employment related / financial profile
          employment_status: source.employment_status,
          annual_income: source.annual_income,
          investment_experience: source.investment_experience,
          source_of_funds: source.source_of_funds,
          risk_tolerance: source.risk_tolerance,
        };

        kycRecord = kycRepoTx.create({
          customer_id: customerId,
          kyc_level: cfg.level,
          status: KycStatus.PENDING,
          submitted_at: new Date(),
          ...cloneFields,
        });
        kycRecord = await kycRepoTx.save(kycRecord);

        // Duplicate documents only if user didn't supply new ones
        if (!payload?.documents || payload.documents.length === 0) {
          const srcDocs = await docRepoTx.find({
            where: { kyc_id: source.id, customer_id: customerId },
          });
          const docsToClone = cfg.requiredDocs.length
            ? srcDocs.filter((d) => cfg.requiredDocs.includes(d.doc_type))
            : srcDocs;
          if (docsToClone.length) {
            const clones = docsToClone.map((d) =>
              docRepoTx.create({
                customer_id: customerId,
                kyc_id: kycRecord!.id,
                doc_type: d.doc_type,
                storage_ref: d.storage_ref,
                checksum: d.checksum,
                encrypted: d.encrypted,
                metadata: d.metadata,
              }),
            );
            await docRepoTx.save(clones);
          }
        }
      }

      // (b) Upsert primary address
      if (payload?.address) {
        const addressRepo = manager.getRepository(CustomerAddress);
        let primary = await addressRepo.findOne({
          where: { customer_id: customerId, is_primary: true },
        });
        if (!primary) {
          primary = addressRepo.create({
            customer_id: customerId,
            is_primary: true,
            ...payload.address,
          });
        } else {
          Object.assign(primary, payload.address);
        }
        await addressRepo.save(primary);
      }

      // (c) Documents (optional; only if provided)
      if (payload?.documents?.length) {
        const docs: CustomerDocument[] = payload.documents.map((d) =>
          docRepoTx.create({
            customer_id: customerId,
            kyc_id: kycRecord?.id || null,
            doc_type: d.doc_type,
            storage_ref: d.storage_ref,
            checksum: d.checksum || null,
            encrypted: false,
            metadata: null,
          }),
        );
        await docRepoTx.save(docs);
      }

      // (d) Service activation
      const config = this.requiredConfig[serviceType];
      const hasPendingKyc = kycRecord?.status === KycStatus.PENDING;

      // Determine if service should be active immediately (must meet all: autoApprove OR no admin approval, no payment, no pending KYC)
      const shouldActivateImmediately =
        !config.requiresPayment &&
        !config.requiresAdminApproval &&
        !hasPendingKyc;

      // Calculate subscription details for subscription-based services
      let subscriptionExpiresAt: Date | null = null;
      let subscriptionFee: number | null = null;

      if (config.subscriptionBased && payload?.subscription) {
        const { duration, fee } = payload.subscription;

        // Calculate expiration date
        subscriptionExpiresAt = new Date();
        subscriptionExpiresAt.setMonth(
          subscriptionExpiresAt.getMonth() + duration,
        );

        // Set subscription fee (use provided fee or calculate default pricing)
        subscriptionFee =
          fee || this.calculateSubscriptionFee(serviceType, duration);
      }

      const service = manager.getRepository(CustomerService).create({
        customer_id: customerId,
        service_type: serviceType,
        active: shouldActivateImmediately,
        requires_payment: config.requiresPayment || false,
        subscription_duration: payload?.subscription?.duration || null,
        subscription_expires_at: subscriptionExpiresAt,
        subscription_fee: subscriptionFee,
        kyc_id: kycRecord?.id,
      });
      const savedService = await manager
        .getRepository(CustomerService)
        .save(service);

      // Determine final status
      let finalStatus = 'activated';
      if (config.requiresPayment) {
        finalStatus = 'pending_payment';
      } else if (config.requiresAdminApproval) {
        finalStatus = 'pending_admin_approval';
      } else if (hasPendingKyc) {
        finalStatus = 'pending_review';
      }

      const result = {
        service: savedService,
        kyc: kycRecord,
        status: finalStatus,
        duplicated_from_kyc_id: duplicatedFromKycId || undefined,
      };

      // Notify admins about new service application
      if (serviceType === CustomerServiceType.PREMIUM_MEMBERSHIP) {
        this.repo.findOne({ where: { id: customerId } }).then((customer) => {
          if (customer) {
            void this.notificationsService.createNotification(
              buildPremiumMembershipApplicationNotification(
                {
                  customerId: customer.id,
                  customerName: customer.username,
                  customerEmail: customer.email,
                },
                result.service.id,
                result.service.subscription_fee || 0,
              ),
            );
          }
        });
      } else if (serviceType === CustomerServiceType.INTERNATIONAL_STOCK_ACCOUNT) {
        this.repo.findOne({ where: { id: customerId } }).then((customer) => {
          if (customer) {
            void this.notificationsService.createNotification(
              buildStockAccountApplicationNotification(
                {
                  customerId: customer.id,
                  customerName: customer.username,
                  customerEmail: customer.email,
                },
                result.service.id,
              ),
            );
          }
        });
      } else if (serviceType === CustomerServiceType.GUARANTEED_RETURNS) {
        this.repo.findOne({ where: { id: customerId } }).then((customer) => {
          if (customer) {
            void this.notificationsService.createNotification(
              buildGuaranteedReturnsApplicationNotification(
                {
                  customerId: customer.id,
                  customerName: customer.username,
                  customerEmail: customer.email,
                },
                result.service.id,
              ),
            );
          }
        });
      }

      return result;
    });
  }

  async approveService(
    serviceId: string,
    reviewerUserId: string,
    context?: PaymentAuditContext,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const svcRepo = manager.getRepository(CustomerService);
      const kycRepo = manager.getRepository(CustomerKyc);
      const usageRepo = manager.getRepository(CustomerKycServiceUsage);

      const service = await svcRepo.findOne({
        where: { id: serviceId },
        relations: ['customer'],
      });
      if (!service) {
        throw new NotFoundException('Service application not found');
      }
      if (service.active) {
        return { service, status: 'already_active' };
      }

      const config = this.requiredConfig[service.service_type];

      // Handle services that require payment + admin approval (like premium membership)
      if (config.requiresPayment && config.requiresAdminApproval) {
        // Check if payment has been completed
        const payments = await this.paymentRecordService.getPaymentsByService(
          service.id,
        );
        const successfulPayment = payments.find(
          (p) => p.status === PaymentStatus.SUCCEEDED,
        );

        if (!successfulPayment) {
          throw new BadRequestException(
            'Payment must be completed before service can be approved',
          );
        }

        // If there is an approved KYC already meeting requirements, link it (optional for payment+admin cases)
        let linkedKyc: CustomerKyc | undefined;
        const approvedKycs = await kycRepo.find({
          where: {
            customer_id: service.customer_id,
            status: KycStatus.APPROVED,
          },
          order: { created_at: 'DESC' },
        });
        if (approvedKycs.length) {
          linkedKyc = approvedKycs[0];
          service.kyc_id = linkedKyc.id;
        }

        // Activate the service
        service.active = true;
        const savedService = await svcRepo.save(service);

        // Record usage if kyc linked
        if (linkedKyc) {
          await usageRepo.insert({
            kyc_id: linkedKyc.id,
            service_id: savedService.id,
            purpose: 'activation',
            kyc_snapshot: {
              kyc_level: linkedKyc.kyc_level,
              reviewed_at: linkedKyc.reviewed_at
                ? linkedKyc.reviewed_at.toISOString()
                : undefined,
              status: linkedKyc.status,
            },
          });
        }

        // Log admin approval
        await this.paymentAuditService.logAdminApproved(
          successfulPayment.id,
          service.customer_id,
          service.service_type,
          reviewerUserId,
          context,
        );

        // Log subscription activation
        await this.paymentAuditService.logSubscriptionActivated(
          successfulPayment.id,
          service.customer_id,
          service.service_type,
          service.subscription_expires_at || undefined,
          context,
        );

        const result = {
          service: savedService,
          status: 'activated',
          payment: successfulPayment,
        };

        // Notify customer about approval
        if (service.customer) {
          const builder = this.getApprovalNotificationBuilder(service.service_type);
          if (builder) {
            void this.notificationsService.createNotification(
              builder(
                {
                  customerId: service.customer.id,
                  customerName: service.customer.username,
                  customerEmail: service.customer.email,
                },
                {
                  adminId: reviewerUserId,
                },
                service.id,
                true,
              ),
            );
          }
        }

        return result;
      }

      // Handle services that require KYC approval (original logic)
      const kycs = await kycRepo.find({
        where: { customer_id: service.customer_id, status: KycStatus.PENDING },
        order: { created_at: 'DESC' },
      });
      const pendingKyc = kycs[0];
      if (!pendingKyc) {
        throw new BadRequestException(
          'No pending KYC to approve for this service',
        );
      }

      pendingKyc.status = KycStatus.APPROVED;
      pendingKyc.reviewed_at = new Date();
      pendingKyc.reviewed_by = reviewerUserId;
      await kycRepo.save(pendingKyc);

      service.active = true;
      service.kyc_id = pendingKyc.id;
      const savedService = await svcRepo.save(service);

      await usageRepo.insert({
        kyc_id: pendingKyc.id,
        service_id: savedService.id,
        purpose: 'activation',
        kyc_snapshot: {
          kyc_level: pendingKyc.kyc_level,
          reviewed_at: pendingKyc.reviewed_at
            ? pendingKyc.reviewed_at.toISOString()
            : undefined,
          status: pendingKyc.status,
        },
      });

      return { service: savedService, kyc: pendingKyc, status: 'activated' };
    });
  }

  async rejectService(
    serviceId: string,
    reviewerUserId: string,
    rejectionReason?: string,
  ) {
    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        const svcRepo =
          transactionalEntityManager.getRepository(CustomerService);
        const kycRepo = transactionalEntityManager.getRepository(CustomerKyc);

        const service = await svcRepo.findOne({
          where: { id: serviceId },
          relations: ['customer'],
        });

        if (!service) {
          throw new NotFoundException('Service not found');
        }

        if (service.active) {
          throw new BadRequestException('Service is already active');
        }

        // Handle payment-based services (premium_stock_picks)
        if (service.service_type === CustomerServiceType.PREMIUM_STOCK_PICKS) {
          const paymentRecords =
            await this.paymentRecordService.getPaymentsByService(
              serviceId,
              PaymentStatus.SUCCEEDED,
            );
          const successfulPayment = paymentRecords[0];

          if (successfulPayment) {
            // Mark service as rejected (set status to cancelled and active to false)
            service.active = false;
            service.status = SubscriptionStatus.CANCELLED;
            const savedService = await svcRepo.save(service);

            // Log rejection in payment audit
            await this.paymentAuditService.logPaymentAction(
              successfulPayment.id,
              service.customer_id,
              PaymentAuditAction.ADMIN_REJECTED,
              `Admin rejected premium service. Reason: ${rejectionReason || 'No reason provided'}`,
              {
                level: PaymentAuditLevel.INFO,
                metadata: {
                  serviceId: service.id,
                  serviceType: service.service_type,
                  rejectionReason: rejectionReason || 'No reason provided',
                  reviewerUserId,
                },
              },
            );

            const result = {
              service: savedService,
              status: 'rejected',
              payment: successfulPayment,
              reason: rejectionReason,
            };

            // Notify customer about rejection
            if (service.customer) {
              const builder = this.getApprovalNotificationBuilder(service.service_type);
              if (builder) {
                void this.notificationsService.createNotification(
                  builder(
                    {
                      customerId: service.customer.id,
                      customerName: service.customer.username,
                      customerEmail: service.customer.email,
                    },
                    {
                      adminId: reviewerUserId,
                    },
                    service.id,
                    false,
                    rejectionReason,
                  ),
                );
              }
            }

            return result;
          }
        }

        // Handle services that require KYC approval (original logic)
        const kycs = await kycRepo.find({
          where: {
            customer_id: service.customer_id,
            status: KycStatus.PENDING,
          },
          order: { created_at: 'DESC' },
        });
        const pendingKyc = kycs[0];
        if (!pendingKyc) {
          throw new BadRequestException(
            'No pending KYC to reject for this service',
          );
        }

        pendingKyc.status = KycStatus.REJECTED;
        pendingKyc.reviewed_at = new Date();
        pendingKyc.reviewed_by = reviewerUserId;
        pendingKyc.rejection_reason = rejectionReason || null;
        await kycRepo.save(pendingKyc);

        // Mark service as cancelled and inactive
        service.active = false;
        service.status = SubscriptionStatus.CANCELLED;
        const savedService = await svcRepo.save(service);

        return {
          service: savedService,
          kyc: pendingKyc,
          status: 'rejected',
          reason: rejectionReason,
        };
      },
    );
  }

  async listKyc(options: {
    page?: number;
    limit?: number;
    status?: KycStatus;
    level?: KycLevel;
    customer_id?: string;
  }) {
    // TypeORM-based optimized approach (no manual raw SQL)
    const { page, limit, skip } = PaginationUtil.calculatePagination({
      page: options.page,
      limit: options.limit,
      defaultLimit: 20,
      maxLimit: 100,
    });

    // 1. Fetch KYC page with filters
    const qb = this.customerKycRepo.createQueryBuilder('k');
    if (options.status) {
      qb.andWhere('k.status = :status', { status: options.status });
    }
    if (options.level) {
      qb.andWhere('k.kyc_level = :level', { level: options.level });
    }
    if (options.customer_id) {
      qb.andWhere('k.customer_id = :cid', { cid: options.customer_id });
    }

    const [kycRecords, total] = await qb
      .orderBy('k.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    if (!kycRecords.length) {
      return PaginationUtil.createPaginatedResult([], total, { page, limit });
    }

    const kycIds = kycRecords.map((k) => k.id);

    // 2. Fetch direct services referencing these KYCs (single query)
    const directServices = await this.customerServiceRepo.find({
      where: kycIds.map((id) => ({ kyc_id: id })),
      order: { applied_at: 'DESC' },
    });

    // 3. Fetch usage rows (if table exists) + associated services (2 queries total, try/catch to skip if not migrated yet)
    let usageServices: CustomerService[] = [];
    try {
      const usageRows = await this.dataSource
        .getRepository(CustomerKycServiceUsage)
        .find({ where: kycIds.map((id) => ({ kyc_id: id })) });
      const usageServiceIds = Array.from(
        new Set(usageRows.map((u) => u.service_id)),
      );
      if (usageServiceIds.length) {
        usageServices = await this.customerServiceRepo.find({
          where: usageServiceIds.map((sid) => ({ id: sid })),
        });
      }
    } catch {
      // ignore (usage table may not exist yet)
    }

    // 4. Combine services deduplicated per KYC
    const allServicesById = new Map<string, CustomerService>();
    [...directServices, ...usageServices].forEach((svc) => {
      if (!allServicesById.has(svc.id)) allServicesById.set(svc.id, svc);
    });

    const servicesByKyc: Record<string, CustomerService[]> = {};
    directServices.forEach((svc) => {
      if (!svc.kyc_id) return;
      (servicesByKyc[svc.kyc_id] = servicesByKyc[svc.kyc_id] || []).push(svc);
    });
    usageServices.forEach((svc) => {
      if (!svc.kyc_id) return; // usage-based link may not set kyc_id on svc (if old record); skip if missing
      const arr = (servicesByKyc[svc.kyc_id] = servicesByKyc[svc.kyc_id] || []);
      if (!arr.some((s) => s.id === svc.id)) arr.push(svc);
    });

    // 5. Shape response
    // 5. Fetch related customer basic profile data
    const customerIds = Array.from(
      new Set(kycRecords.map((k) => k.customer_id)),
    );
    let customersById: Record<string, Partial<Customer>> = {};
    if (customerIds.length) {
      const customerEntities = await this.repo.find({
        where: customerIds.map((id) => ({ id })),
        select: [
          'id',
          'username',
          'email',
          'first_name',
          'last_name',
          'status',
          'created_at',
        ],
      });
      customersById = customerEntities.reduce<
        Record<string, Partial<Customer>>
      >((acc, c) => {
        acc[c.id] = c;
        return acc;
      }, {});
    }

    const enriched = kycRecords.map((k) => ({
      ...k,
      customer: customersById[k.customer_id] || null,
      services: (servicesByKyc[k.id] || []).map((s) => ({
        id: s.id,
        service_type: s.service_type,
        active: s.active,
        subscription_duration: s.subscription_duration,
        subscription_expires_at: s.subscription_expires_at,
        applied_at: s.applied_at,
      })),
    }));

    return PaginationUtil.createPaginatedResult(enriched, total, {
      page,
      limit,
    });
  }

  // --- Password Reset Methods ---

  async forgotPassword(
    dto: ForgotPasswordDto,
    context?: { userAgent?: string; ipAddress?: string },
  ): Promise<{
    status: string;
    message: string;
    expires_at: string;
    method: PasswordResetMethod;
  }> {
    // Rate limiting: Allow max 3 requests per email per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentRequests = await this.passwordResetRepo.count({
      where: {
        email: dto.email,
        created_at: MoreThan(oneHourAgo),
      },
    });

    if (recentRequests >= 3) {
      throw new BadRequestException(
        'Too many password reset requests. Please try again later.',
      );
    }

    // Find customer by email
    const customer = await this.repo.findOne({
      where: { email: dto.email },
      select: ['id', 'email', 'first_name', 'last_name', 'username'],
    });

    // Always return success to prevent email enumeration attacks
    if (!customer) {
      throw new BadRequestException('Email not existing in system.');
      // return {
      //   status: 'success',
      //   message:
      //     'If the email exists, password reset instructions have been sent.',
      //   expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      //   method: dto.method || PasswordResetMethod.EMAIL_OTP,
      // };
    }

    // Invalidate existing active tokens for this email
    await this.passwordResetRepo.update(
      {
        email: dto.email,
        status: PasswordResetStatus.PENDING,
      },
      {
        status: PasswordResetStatus.REVOKED,
      },
    );

    const method = dto.method || PasswordResetMethod.EMAIL_OTP;
    let token: string;
    let expiresAt: Date;

    if (method === PasswordResetMethod.EMAIL_OTP) {
      // Generate 6-digit OTP
      token = crypto.randomInt(100000, 999999).toString();
      expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    } else {
      // Generate secure token for email link
      token = crypto.randomBytes(32).toString('hex');
      expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    }

    // Hash the token before storing
    const tokenHash = await argon2.hash(token);

    // Create password reset record
    const passwordReset = this.passwordResetRepo.create({
      customer_id: customer.id,
      email: customer.email,
      reset_type:
        method === PasswordResetMethod.EMAIL_OTP
          ? PasswordResetType.EMAIL_OTP
          : PasswordResetType.EMAIL_LINK,
      status: PasswordResetStatus.PENDING,
      token_hash: tokenHash,
      expires_at: expiresAt,
      user_agent: context?.userAgent || null,
      ip_address: context?.ipAddress || null,
    });

    await this.passwordResetRepo.save(passwordReset);

    // Send email
    const customerName = customer.first_name || customer.username;

    if (method === PasswordResetMethod.EMAIL_OTP) {
      await this.emailService.sendOtpEmail({
        email: customer.email,
        otp: token,
        expiresAt,
        customerName,
      });
    } else {
      // Create JWT token for the reset link
      const resetToken = this.jwtService.sign(
        {
          sub: customer.id,
          email: customer.email,
          type: 'password_reset',
          reset_id: passwordReset.id,
        },
        {
          secret: this.configService.get<string>(
            'JWT_SECRET',
            'your-secret-key',
          ),
          expiresIn: '1h',
        },
      );

      const resetLink = `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/reset-password?token=${resetToken}`;

      await this.emailService.sendResetLinkEmail({
        email: customer.email,
        resetLink,
        expiresAt,
        customerName,
      });
    }

    return {
      status: 'success',
      message: 'Password reset instructions sent to your email.',
      expires_at: expiresAt.toISOString(),
      method,
    };
  }

  async resetPasswordWithOtp(
    dto: ResetPasswordWithOtpDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context?: { userAgent?: string; ipAddress?: string },
  ): Promise<{ status: string; message: string; reset_at: string }> {
    // Find active OTP reset record
    const resetRecord = await this.passwordResetRepo.findOne({
      where: {
        email: dto.email,
        reset_type: PasswordResetType.EMAIL_OTP,
        status: PasswordResetStatus.PENDING,
        expires_at: MoreThan(new Date()),
      },
      order: { created_at: 'DESC' },
      relations: ['customer'],
    });

    if (!resetRecord) {
      throw new BadRequestException('Invalid or expired OTP.');
    }

    // Check attempt limit
    if (resetRecord.attempt_count >= resetRecord.max_attempts) {
      resetRecord.status = PasswordResetStatus.REVOKED;
      await this.passwordResetRepo.save(resetRecord);
      throw new BadRequestException(
        'Too many failed attempts. Please request a new OTP.',
      );
    }

    // Verify OTP
    const isValidOtp = await argon2.verify(resetRecord.token_hash, dto.otp);

    if (!isValidOtp) {
      resetRecord.attempt_count += 1;
      await this.passwordResetRepo.save(resetRecord);
      throw new BadRequestException('Invalid OTP.');
    }

    // Update password
    const hashedPassword = await argon2.hash(dto.new_password);
    await this.repo.update(resetRecord.customer_id, {
      password: hashedPassword,
    });

    // Mark reset as used
    resetRecord.status = PasswordResetStatus.USED;
    resetRecord.used_at = new Date();
    await this.passwordResetRepo.save(resetRecord);

    // Invalidate all other pending resets for this customer
    await this.passwordResetRepo.update(
      {
        email: dto.email,
        status: PasswordResetStatus.PENDING,
      },
      {
        status: PasswordResetStatus.REVOKED,
      },
    );

    const resetAt = new Date().toISOString();

    return {
      status: 'success',
      message: 'Password reset successfully.',
      reset_at: resetAt,
    };
  }

  async resetPasswordWithToken(
    dto: ResetPasswordWithTokenDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context?: { userAgent?: string; ipAddress?: string },
  ): Promise<{ status: string; message: string; reset_at: string }> {
    try {
      // Define interface for JWT payload
      interface ResetTokenPayload {
        sub: string;
        email: string;
        type: string;
        reset_id: string;
      }

      // Verify JWT token
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const payload = this.jwtService.verify(dto.reset_token, {
        secret: this.configService.get<string>('JWT_SECRET', 'your-secret-key'),
      }) as ResetTokenPayload;

      if (payload.type !== 'password_reset') {
        throw new UnauthorizedException('Invalid token type.');
      }

      // Find the reset record
      const resetRecord = await this.passwordResetRepo.findOne({
        where: {
          id: payload.reset_id,
          customer_id: payload.sub,
          email: payload.email,
          reset_type: PasswordResetType.EMAIL_LINK,
          status: PasswordResetStatus.PENDING,
          expires_at: MoreThan(new Date()),
        },
        relations: ['customer'],
      });

      if (!resetRecord) {
        throw new BadRequestException('Invalid or expired reset token.');
      }

      // Update password
      const hashedPassword = await argon2.hash(dto.new_password);
      await this.repo.update(resetRecord.customer_id, {
        password: hashedPassword,
      });

      // Mark reset as used
      resetRecord.status = PasswordResetStatus.USED;
      resetRecord.used_at = new Date();
      await this.passwordResetRepo.save(resetRecord);

      // Invalidate all other pending resets for this customer
      await this.passwordResetRepo.update(
        {
          email: payload.email,
          status: PasswordResetStatus.PENDING,
        },
        {
          status: PasswordResetStatus.REVOKED,
        },
      );

      const resetAt = new Date().toISOString();

      return {
        status: 'success',
        message: 'Password reset successfully.',
        reset_at: resetAt,
      };
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.name === 'JsonWebTokenError' ||
          error.name === 'TokenExpiredError')
      ) {
        throw new BadRequestException('Invalid or expired reset token.');
      }
      throw error;
    }
  }

  // --- Premium Membership with Payment ---

  async applyPremiumMembershipWithPayment(
    customerId: string,
    subscriptionParams: {
      duration: SubscriptionDuration;
      fee?: number;
    },
  ) {
    // Prevent duplicate application if there is:
    // 1. An active premium membership (active = true and not expired)
    // 2. A pending premium membership application awaiting payment approval (active = false but payment in pending/slip submitted/processing)
    // 3. A non-expired (future subscription_expires_at) membership even if active flag still true
    const now = new Date();
    const candidateServices = await this.customerServiceRepo.find({
      where: {
        customer_id: customerId,
        service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
      },
    });

    if (candidateServices.length) {
      // Load payments for these services to assess pending state
      const serviceIds = candidateServices.map((s) => s.id);
      const pendingRelatedPayments = await this.paymentRepo.find({
        where: serviceIds.map((id) => ({
          service_id: id,
        })),
      });

      const blockingService = candidateServices.find((svc) => {
        const notExpired =
          svc.subscription_expires_at && svc.subscription_expires_at > now;
        const hasActive =
          svc.active && (notExpired || !svc.subscription_expires_at);
        const relatedPayments = pendingRelatedPayments.filter(
          (p) => p.service_id === svc.id,
        );
        const hasPendingPayment = relatedPayments.some((p) =>
          [
            PaymentStatus.PENDING,
            PaymentStatus.PAYMENT_SLIP_SUBMITTED,
            PaymentStatus.PROCESSING,
          ].includes(p.status),
        );
        return hasActive || hasPendingPayment;
      });

      if (blockingService) {
        throw new BadRequestException(
          'Premium membership application already exists and is active or pending approval. You cannot apply again until it is approved, rejected, or expired.',
        );
      }
    }

    // Calculate subscription fee
    const fee =
      subscriptionParams.fee ||
      this.calculateSubscriptionFee(
        CustomerServiceType.PREMIUM_MEMBERSHIP,
        subscriptionParams.duration,
      );

    // Create payment intent
    const paymentIntent = await this.paymentService.createPaymentIntent({
      amount: fee * 100, // Convert to cents
      currency: 'USD',
      description: `Premium Membership - ${subscriptionParams.duration} months`,
      metadata: {
        customer_id: customerId,
        service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
        subscription_duration: subscriptionParams.duration,
      },
      returnUrl: `${this.configService.get('FRONTEND_URL')}/payment/success`,
      cancelUrl: `${this.configService.get('FRONTEND_URL')}/payment/cancel`,
    });

    // Apply the service with pending payment status
    const serviceResult = await this.applyService(
      customerId,
      CustomerServiceType.PREMIUM_MEMBERSHIP,
      {
        subscription: {
          duration: subscriptionParams.duration,
          fee,
        },
      },
    );

    // Type-safe service extraction
    const service = serviceResult.service;

    // Create payment record with audit context
    const paymentContext: PaymentAuditContext = {
      ip_address: undefined, // Will be provided by controller
      user_agent: undefined, // Will be provided by controller
    };

    const paymentRecord = await this.paymentRecordService.createPayment(
      {
        customer_id: customerId,
        service_id: service.id,
        payment_type: PaymentType.SUBSCRIPTION,
        payment_method: PaymentMethod.STRIPE, // Default method
        amount: fee,
        currency: 'USD',
        description: `Premium Membership - ${subscriptionParams.duration} months`,
        context: paymentContext,
      },
      paymentIntent,
    );

    // Log that subscription is pending admin approval after payment
    await this.paymentAuditService.logAdminApprovalPending(
      paymentRecord.id,
      customerId,
      CustomerServiceType.PREMIUM_MEMBERSHIP,
      paymentContext,
    );

    return {
      status: serviceResult.status,
      service: service,
      payment: {
        payment_id: paymentIntent.id,
        payment_url: paymentIntent.payment_url,
        amount: paymentIntent.amount / 100, // Convert back to dollars
        currency: paymentIntent.currency,
        expires_at: paymentIntent.expires_at,
      },
    };
  }

  async confirmPayment(paymentIntentId: string, context?: PaymentAuditContext) {
    // Update payment record status
    const paymentRecord = await this.paymentRecordService.updatePaymentStatus(
      paymentIntentId,
      PaymentStatus.SUCCEEDED,
      { context },
    );

    // Confirm payment with payment provider
    const paymentIntent =
      await this.paymentService.confirmPayment(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestException('Payment confirmation failed');
    }

    // Find the service using the payment record
    if (!paymentRecord.service_id) {
      throw new BadRequestException('Payment record has no associated service');
    }

    const service = await this.customerServiceRepo.findOne({
      where: { id: paymentRecord.service_id },
    });

    if (!service) {
      throw new NotFoundException('Service application not found');
    }

    // Check if this service requires admin approval after payment
    const config = this.requiredConfig[service.service_type];

    if (config.requiresAdminApproval && config.requiresPayment) {
      // For premium membership and similar services that require both payment AND admin approval
      // Do NOT activate automatically - keep waiting for admin approval

      await this.paymentAuditService.logAdminApprovalPending(
        paymentRecord.id,
        paymentRecord.customer_id,
        service.service_type,
        context,
      );

      return {
        status: 'payment_confirmed_pending_admin_approval',
        service: service,
        payment_id: paymentIntentId,
        payment_record: paymentRecord,
        message:
          'Payment confirmed successfully. Service activation pending admin approval.',
      };
    } else {
      // For services that only require payment (no admin approval), activate immediately
      await this.customerServiceRepo.update(service.id, {
        active: true,
        status: SubscriptionStatus.ACTIVE,
      });

      // Log subscription activation
      await this.paymentAuditService.logSubscriptionActivated(
        paymentRecord.id,
        paymentRecord.customer_id,
        service.service_type,
        service.subscription_expires_at || undefined,
        context,
      );

      return {
        status: 'activated',
        service: {
          ...service,
          active: true,
        },
        payment_id: paymentIntentId,
        payment_record: paymentRecord,
      };
    }
  }

  // --- Premium Membership Manual Payment ---

  async applyPremiumMembershipManual(
    customerId: string,
    subscriptionParams: {
      duration: SubscriptionDuration;
      fee?: number;
    },
  ) {
    // Check if customer already has active premium membership
    const existingService = await this.customerServiceRepo.findOne({
      where: {
        customer_id: customerId,
        service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
        active: true,
      },
    });

    if (existingService) {
      throw new BadRequestException(
        'Customer already has an active premium membership',
      );
    }

    // Calculate subscription fee
    const fee =
      subscriptionParams.fee ||
      this.calculateSubscriptionFee(
        CustomerServiceType.PREMIUM_MEMBERSHIP,
        subscriptionParams.duration,
      );

    // Apply the service with pending payment status
    const serviceResult = await this.applyService(
      customerId,
      CustomerServiceType.PREMIUM_MEMBERSHIP,
      {
        subscription: {
          duration: subscriptionParams.duration,
          fee,
        },
      },
    );

    // Create manual payment record
    const paymentRecord = await this.paymentRecordService.createPayment(
      {
        customer_id: customerId,
        service_id: serviceResult.service.id,
        payment_type: PaymentType.SUBSCRIPTION,
        payment_method: PaymentMethod.MANUAL_TRANSFER,
        amount: fee,
        currency: 'USD',
        description: `Premium Membership - ${subscriptionParams.duration} months (Manual Payment)`,
      },
      {
        id: `manual-${Date.now()}-${customerId}`,
        payment_url: `manual-payment-${customerId}`,
        amount: fee * 100, // In cents
        currency: 'USD',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        status: 'pending',
      },
    );

    return {
      status: 'pending_payment_slip',
      service: serviceResult.service,
      payment: {
        payment_id: paymentRecord.id,
        amount: fee,
        currency: 'USD',
        instructions:
          'Please upload your payment slip after making the transfer',
      },
    };
  }

  async applyPremiumMembershipWithPaymentSlip(
    customerId: string,
    packageId: string,
    paymentSlipData: {
      payment_slip_url: string;
      payment_slip_filename: string;
      payment_amount: number;
      payment_reference?: string;
    },
    couponCode?: string,
  ) {
    // 1) Block if there is any unapproved/pending application (any package)
    const approvableStatuses = [
      PaymentStatus.PENDING,
      PaymentStatus.PAYMENT_SLIP_SUBMITTED,
      PaymentStatus.PROCESSING,
    ];
    const pendingPayment = await this.paymentRepo
      .createQueryBuilder('p')
      .leftJoin('p.service', 's')
      .where('p.customer_id = :cid', { cid: customerId })
      .andWhere('p.status IN (:...st)', { st: approvableStatuses })
      .andWhere('s.service_type = :stype', {
        stype: CustomerServiceType.PREMIUM_MEMBERSHIP,
      })
      .getOne();
    if (pendingPayment) {
      throw new BadRequestException(
        'You already have a pending premium membership application under review',
      );
    }

    // Load subscription package
    const pkg = await this.subscriptionPackagesService.findActiveById(
      packageId,
      CustomerServiceType.PREMIUM_MEMBERSHIP,
    );

    if (!pkg) {
      throw new BadRequestException(
        'Subscription package not found or inactive',
      );
    }

    // Map package duration to enum (assert value is valid)
    const duration = pkg.duration_months as SubscriptionDuration;
    if (!Object.values(SubscriptionDuration).includes(duration)) {
      throw new BadRequestException(
        'Unsupported subscription package duration',
      );
    }

    let fee = Number(pkg.price);
    let discountAmount = 0;
    let couponId: string | undefined;

    if (couponCode) {
      const coupon = await this.couponsService.validateCoupon(
        couponCode,
        CustomerServiceType.PREMIUM_MEMBERSHIP,
        fee,
        customerId,
      );
      const calculation = this.couponsService.calculateDiscount(coupon, fee);
      fee = calculation.final_amount;
      discountAmount = calculation.discount_amount;
      couponId = coupon.id;
    }

    // 2) If applying different package while current subscription not expired -> block
    const now = new Date();
    const currentActive = await this.customerServiceRepo.findOne({
      where: {
        customer_id: customerId,
        service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
        active: true,
      },
    });
    if (currentActive) {
      const notExpired =
        !currentActive.subscription_expires_at ||
        currentActive.subscription_expires_at > now;
      if (notExpired) {
        throw new BadRequestException(
          'Your current premium membership is still active. You cannot switch to a different package until it expires.',
        );
      }
    }

    // 3/4) Proceed with transaction to reuse/update existing service or create new and create payment
    return await this.dataSource.transaction(async (manager) => {
      const serviceRepo = manager.getRepository(CustomerService);
      const paymentRepo = manager.getRepository(Payment);

      // Re-check pending payment inside transaction for race conditions
      const pendingInside = await paymentRepo
        .createQueryBuilder('p')
        .leftJoin('p.service', 's')
        .where('p.customer_id = :cid', { cid: customerId })
        .andWhere('p.status IN (:...st)', { st: approvableStatuses })
        .andWhere('s.service_type = :stype', {
          stype: CustomerServiceType.PREMIUM_MEMBERSHIP,
        })
        .getOne();
      if (pendingInside) {
        throw new BadRequestException(
          'You already have a pending premium membership application under review',
        );
      }

      // Determine target service to attach this application to
      const latestService = await serviceRepo.findOne({
        where: {
          customer_id: customerId,
          service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
        },
        order: { applied_at: 'DESC' },
      });

      let targetService: CustomerService;

      if (!latestService) {
        // No existing service: create a new pending service
        targetService = serviceRepo.create({
          customer_id: customerId,
          service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
          active: false,
          requires_payment: true,
          subscription_duration: duration,
          subscription_fee: fee,
          subscription_expires_at: null,
          subscription_package_id: packageId,
        });
        targetService = await serviceRepo.save(targetService);
      } else {
        const samePackage = latestService.subscription_package_id === packageId;
        // If currently active and same package: deactivate before new application
        if (latestService.active && samePackage) {
          await serviceRepo.update(latestService.id, { active: false });
        }

        // Update existing service with new package details
        await serviceRepo.update(latestService.id, {
          subscription_fee: fee,
          subscription_duration: duration,
          subscription_package_id: packageId,
          subscription_expires_at: null, // will be set on approval
          active: false,
        });
        targetService = {
          ...latestService,
          subscription_fee: fee,
          subscription_duration: duration,
          subscription_package_id: packageId,
          subscription_expires_at: null,
          // active: false,
        } as CustomerService;
      }

      // Create payment record with slip data submitted immediately
      const manualIntentId = `manual-${Date.now()}-${customerId}`;
      const paymentEntity: Partial<Payment> = {
        customer_id: customerId,
        service_id: targetService.id,
        payment_type: PaymentType.SUBSCRIPTION,
        payment_method: PaymentMethod.MANUAL_TRANSFER,
        amount: fee,
        currency: 'USD',
        status: PaymentStatus.PENDING,
        description: `Premium Membership - ${duration} months (Manual Payment)`,
        payment_intent_id: manualIntentId,
        external_payment_id: manualIntentId,
        payment_url: undefined,
        payment_url_expires_at: undefined,
        payment_slip_url: paymentSlipData.payment_slip_url,
        payment_slip_filename: paymentSlipData.payment_slip_filename,
        payment_reference: paymentSlipData.payment_reference,
        payment_slip_submitted_at: new Date(),
        payment_metadata: { package_id: packageId },
        subscription_package_id: packageId,
      };
      const paymentRecord = await paymentRepo.save(paymentEntity);

      if (couponId) {
        await this.couponsService.recordUsage(
          couponId,
          customerId,
          discountAmount,
          paymentRecord.id,
        );
      }

      return {
        status: 'pending',
        service: targetService,
        payment: {
          payment_id: paymentRecord.id,
          amount: fee,
          currency: 'USD',
          payment_slip_filename: paymentRecord.payment_slip_filename,
          submitted_at: paymentRecord.payment_slip_submitted_at,
          instructions: 'Payment recorded and pending admin review.',
        },
      };
    });
  }

  async redeemPremiumMembershipCoupon(customerId: string, code: string) {
    const coupon = await this.couponsService.validateCoupon(
      code,
      CustomerServiceType.PREMIUM_MEMBERSHIP,
      0, // Amount 0 for redemption
      customerId,
    );

    const durationMonths = coupon.subscription_package?.duration_months;
    if (!durationMonths) {
      throw new BadRequestException(
        'This coupon does not grant a specific subscription package. Please use it during the regular application flow.',
      );
    }

    return await this.dataSource.transaction(async (manager) => {
      const serviceRepo = manager.getRepository(CustomerService);
      const paymentRepo = manager.getRepository(Payment);

      const latestService = await serviceRepo.findOne({
        where: {
          customer_id: customerId,
          service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
        },
        order: { applied_at: 'DESC' },
      });

      const now = new Date();
      let subscriptionExpiresAt: Date;
      let targetService: CustomerService;

      if (!latestService) {
        subscriptionExpiresAt = new Date(now);
        subscriptionExpiresAt.setMonth(
          subscriptionExpiresAt.getMonth() + durationMonths,
        );

        targetService = serviceRepo.create({
          customer_id: customerId,
          service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
          active: true,
          status: SubscriptionStatus.ACTIVE,
          requires_payment: false,
          subscription_duration: durationMonths as any,
          subscription_fee: 0,
          subscription_expires_at: subscriptionExpiresAt,
          subscription_package_id: coupon.subscription_package_id,
        });
        targetService = await serviceRepo.save(targetService);
      } else {
        const base =
          latestService.active &&
            latestService.subscription_expires_at &&
            latestService.subscription_expires_at > now
            ? latestService.subscription_expires_at
            : now;

        subscriptionExpiresAt = new Date(base);
        subscriptionExpiresAt.setMonth(
          subscriptionExpiresAt.getMonth() + durationMonths,
        );

        await serviceRepo.update(latestService.id, {
          active: true,
          status: SubscriptionStatus.ACTIVE,
          subscription_duration: durationMonths as any,
          subscription_fee: 0,
          subscription_expires_at: subscriptionExpiresAt,
          subscription_package_id: coupon.subscription_package_id,
        });

        targetService = {
          ...latestService,
          active: true,
          status: SubscriptionStatus.ACTIVE,
          subscription_duration: durationMonths,
          subscription_expires_at: subscriptionExpiresAt,
          subscription_package_id: coupon.subscription_package_id,
        } as any;
      }

      // Record a "free" payment for tracking
      const paymentId = `coupon-redeem-${Date.now()}-${customerId}`;
      const paymentRecord = await paymentRepo.save({
        customer_id: customerId,
        service_id: targetService.id,
        payment_type: PaymentType.SUBSCRIPTION,
        payment_method: PaymentMethod.RECOUPON,
        amount: 0,
        currency: 'USD',
        status: PaymentStatus.SUCCEEDED,
        description: `Premium Membership - ${durationMonths} months (Coupon Redemption: ${code})`,
        payment_intent_id: paymentId,
        external_payment_id: paymentId,
        paid_at: now,
        approved_at: now,
        admin_notes: `Redeemed via coupon code: ${code}`,
        subscription_package_id: coupon.subscription_package_id,
        subscription_expires_at: subscriptionExpiresAt,
      });

      await this.couponsService.recordUsage(
        coupon.id,
        customerId,
        0,
        paymentRecord.id,
      );

      // Notifications are handled in the controller.

      return {
        status: 'success',
        durationMonths,
        message: `Coupon redeemed successfully. ${durationMonths} months of Premium Membership granted.`,
        service: targetService,
        subscription_expires_at: subscriptionExpiresAt,
        payment: paymentRecord,
      };
    });
  }

  async submitPaymentSlipForService(
    customerId: string,
    paymentId: string,
    paymentSlipData: {
      payment_slip_url: string;
      payment_slip_filename: string;
      payment_amount: number;
      payment_reference?: string;
    },
  ) {
    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        const paymentRepo = transactionalEntityManager.getRepository(Payment);

        // Find the payment record
        const payment = await paymentRepo.findOne({
          where: {
            id: paymentId,
            customer_id: customerId,
            status: PaymentStatus.PENDING,
          },
          relations: ['service'],
        });

        if (!payment) {
          throw new NotFoundException(
            'Payment record not found or not in pending status',
          );
        }

        // Update payment record with slip information
        await paymentRepo.update(payment.id, {
          payment_slip_url: paymentSlipData.payment_slip_url,
          payment_slip_filename: paymentSlipData.payment_slip_filename,
          payment_reference: paymentSlipData.payment_reference,
          payment_slip_submitted_at: new Date(),
          status: PaymentStatus.PAYMENT_SLIP_SUBMITTED,
        });

        // Get updated payment record
        const updatedPayment = await paymentRepo.findOne({
          where: { id: paymentId },
          relations: ['service', 'customer'],
        });

        if (updatedPayment?.customer) {
          void this.notificationsService.createNotification(
            buildPaymentSlipSubmissionNotification(
              {
                customerId: updatedPayment.customer.id,
                customerName: updatedPayment.customer.username,
                customerEmail: updatedPayment.customer.email,
              },
              updatedPayment.id,
              updatedPayment.amount,
              updatedPayment.service?.service_type || 'service',
            ),
          );
        }

        return {
          status: 'payment_slip_submitted',
          message: 'Payment slip submitted successfully. Pending admin review.',
          payment: updatedPayment,
        };
      },
    );
  }

  async approveServicePayment(
    paymentId: string,
    adminUserId: string,
    adminNotes?: string,
  ) {
    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        const paymentRepo = transactionalEntityManager.getRepository(Payment);
        const serviceRepo =
          transactionalEntityManager.getRepository(CustomerService);

        // Find the payment record in an approvable status (either initial pending or slip submitted)
        const approvableStatuses = [
          PaymentStatus.PENDING,
          PaymentStatus.PAYMENT_SLIP_SUBMITTED,
        ];
        const payment = await paymentRepo.findOne({
          where: {
            id: paymentId,
            status: In(approvableStatuses),
          },
          relations: ['service', 'customer'],
        });

        if (!payment) {
          throw new NotFoundException(
            'Payment record not found or not in an approvable status',
          );
        }

        const now = new Date();

        // Ensure subscription expiration & fee are set, and extend on subsequent approvals
        const service = payment.service;
        const base =
          service.subscription_expires_at &&
            service.subscription_expires_at > now
            ? service.subscription_expires_at
            : now;
        let subscriptionExpiresAt = service.subscription_expires_at;
        if (service.subscription_duration) {
          const exp = new Date(base);
          exp.setMonth(exp.getMonth() + service.subscription_duration);
          subscriptionExpiresAt = exp;
        }

        // Approve payment and set resulting subscription expiration on the payment record
        await paymentRepo.update(payment.id, {
          status: PaymentStatus.SUCCEEDED,
          approved_by_admin_id: adminUserId,
          approved_at: now,
          admin_notes: adminNotes,
          paid_at: now,
          subscription_expires_at: subscriptionExpiresAt ?? null,
          // subscription_package_id is typically set during application; preserve if present
        });

        await serviceRepo.update(service.id, {
          active: true,
          subscription_expires_at: subscriptionExpiresAt,
          subscription_fee: service.subscription_fee ?? payment.amount,
          status: SubscriptionStatus.ACTIVE,
        });

        // Notify customer about approval
        if (payment.customer) {
          const builder = this.getApprovalNotificationBuilder(service.service_type);
          if (builder) {
            void this.notificationsService.createNotification(
              builder(
                {
                  customerId: payment.customer.id,
                  customerName: payment.customer.username,
                  customerEmail: payment.customer.email,
                },
                {
                  adminId: adminUserId,
                },
                payment.id,
                true,
              ),
            );
          }
        }

        return {
          status: 'approved',
          message: 'Payment approved and service activated successfully',
          service_id: service.id,
          subscription_expires_at: subscriptionExpiresAt,
        };
      },
    );
  }

  async rejectServicePayment(
    paymentId: string,
    adminUserId: string,
    rejectionReason: string,
    adminNotes?: string,
  ) {
    return await this.dataSource.transaction(
      async (transactionalEntityManager) => {
        const paymentRepo = transactionalEntityManager.getRepository(Payment);

        const payment = await paymentRepo.findOne({
          where: { id: paymentId },
          relations: ['service', 'customer'],
        });

        if (!payment) {
          throw new NotFoundException('Payment record not found');
        }

        await paymentRepo.update(payment.id, {
          status: PaymentStatus.FAILED,
          admin_notes: `${adminNotes ? adminNotes + '\n' : ''}Rejection Reason: ${rejectionReason}`,
        });

        // Notify customer about rejection
        if (payment.customer && payment.service) {
          const builder = this.getApprovalNotificationBuilder(payment.service.service_type);
          if (builder) {
            void this.notificationsService.createNotification(
              builder(
                {
                  customerId: payment.customer.id,
                  customerName: payment.customer.username,
                  customerEmail: payment.customer.email,
                },
                {
                  adminId: adminUserId,
                },
                payment.id,
                false,
                rejectionReason,
              ),
            );
          }
        }

        return {
          status: 'rejected',
          message: 'Payment rejected and customer notified',
        };
      },
    );
  }

  /**
   * Manual renewal flow using payment slip (no online gateway)
   * Creates a new pending (inactive) service record and a pending payment with slip metadata.
   * Admin must approve via approveServicePayment (same endpoint as initial application).
   */
  async renewPremiumMembershipWithSlip(
    customerId: string,
    packageId: string,
    paymentSlip: {
      payment_slip_url: string;
      payment_slip_filename: string;
      payment_amount: number;
      payment_reference?: string;
    },
  ) {
    // Find latest existing premium membership (active or expired)
    const existing = await this.customerServiceRepo.find({
      where: {
        customer_id: customerId,
        service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
      },
      order: { applied_at: 'DESC' },
      take: 1,
    });

    if (!existing.length) {
      throw new BadRequestException(
        'No existing premium membership to renew. Apply first.',
      );
    }

    const pkg = await this.subscriptionPackagesService.findActiveById(
      packageId,
      CustomerServiceType.PREMIUM_MEMBERSHIP,
    );

    if (!pkg) {
      throw new BadRequestException(
        'Subscription package not found or inactive',
      );
    }

    const duration = pkg.duration_months as SubscriptionDuration;
    if (!Object.values(SubscriptionDuration).includes(duration)) {
      throw new BadRequestException(
        'Unsupported subscription package duration',
      );
    }

    const fee = Number(pkg.price);

    // if (Math.abs(paymentSlip.payment_amount - fee) > 0.01) {
    //   throw new BadRequestException(
    //     `Payment amount (${paymentSlip.payment_amount}) does not match subscription fee (${fee})`,
    //   );
    // }

    return this.dataSource.transaction(async (manager) => {
      const serviceRepo = manager.getRepository(CustomerService);
      const paymentRepo = manager.getRepository(Payment);

      // Create new pending renewal service
      const renewalService = serviceRepo.create({
        customer_id: customerId,
        service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
        active: false, // pending approval
        requires_payment: true,
        subscription_duration: duration,
        subscription_fee: fee,
        subscription_expires_at: null, // set upon approval
        subscription_package_id: packageId,
      });
      const savedService = await serviceRepo.save(renewalService);

      // Create pending payment with slip
      const manualIntentId = `manual-renew-${Date.now()}-${customerId}`;
      const paymentEntity: Partial<Payment> = {
        customer_id: customerId,
        service_id: savedService.id,
        payment_type: PaymentType.RENEWAL,
        payment_method: PaymentMethod.MANUAL_TRANSFER,
        amount: fee,
        currency: 'USD',
        status: PaymentStatus.PENDING,
        description: `Premium Membership Renewal - ${duration} months (Manual Payment)`,
        payment_intent_id: manualIntentId,
        external_payment_id: manualIntentId,
        payment_url: undefined,
        payment_url_expires_at: undefined,
        payment_slip_url: paymentSlip.payment_slip_url,
        payment_slip_filename: paymentSlip.payment_slip_filename,
        payment_reference: paymentSlip.payment_reference,
        payment_slip_submitted_at: new Date(),
        payment_metadata: { package_id: packageId },
        subscription_package_id: packageId,
      };
      const paymentRecord = await paymentRepo.save(paymentEntity);

      // Notify admins about renewal application
      this.repo.findOne({ where: { id: customerId } }).then((customer) => {
        if (customer) {
          void this.notificationsService.createNotification(
            buildPremiumMembershipApplicationNotification(
              {
                customerId: customer.id,
                customerName: customer.username,
                customerEmail: customer.email,
              },
              paymentRecord.id,
              fee,
            ),
          );
        }
      });

      return {
        status: 'renewal_pending_admin_review',
        renewal_service: savedService,
        payment: {
          payment_id: paymentRecord.id,
          amount: fee,
          currency: 'USD',
          payment_slip_filename: paymentRecord.payment_slip_filename,
          submitted_at: paymentRecord.payment_slip_submitted_at,
          instructions: 'Renewal payment slip submitted. Pending admin review.',
        },
      };
    });
  }

  // --- Premium Membership Renewal ---

  async renewPremiumMembership(
    customerId: string,
    subscriptionParams: {
      duration: SubscriptionDuration;
      fee?: number;
    },
    context?: PaymentAuditContext,
  ) {
    // Check if customer has an existing premium membership (active or expired)
    const existingService = await this.customerServiceRepo.findOne({
      where: {
        customer_id: customerId,
        service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
      },
      order: { applied_at: 'DESC' }, // Get the most recent one
    });

    if (!existingService) {
      throw new BadRequestException(
        'Customer must have an existing premium membership to renew',
      );
    }

    // Calculate subscription fee
    const fee =
      subscriptionParams.fee ||
      this.calculateSubscriptionFee(
        CustomerServiceType.PREMIUM_MEMBERSHIP,
        subscriptionParams.duration,
      );

    // Create payment intent for renewal
    const paymentIntent = await this.paymentService.createPaymentIntent({
      amount: fee * 100, // Convert to cents
      currency: 'USD',
      description: `Premium Membership Renewal - ${subscriptionParams.duration} months`,
      metadata: {
        customer_id: customerId,
        service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
        subscription_duration: subscriptionParams.duration,
        renewal: 'true',
        previous_service_id: existingService.id,
      },
      returnUrl: `${this.configService.get('FRONTEND_URL')}/payment/success`,
      cancelUrl: `${this.configService.get('FRONTEND_URL')}/payment/cancel`,
    });

    // Calculate new expiration date (from current expiration or now, whichever is later)
    const now = new Date();
    const currentExpiration = existingService.subscription_expires_at || now;
    const renewalStartDate = currentExpiration > now ? currentExpiration : now;

    const newExpirationDate = new Date(renewalStartDate);
    newExpirationDate.setMonth(
      newExpirationDate.getMonth() + subscriptionParams.duration,
    );

    // Create new service record for renewal
    const renewalService = this.customerServiceRepo.create({
      customer_id: customerId,
      service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
      active: false, // Will be activated after payment + admin approval
      requires_payment: true,
      subscription_duration: subscriptionParams.duration,
      subscription_expires_at: newExpirationDate,
      subscription_fee: fee,
    });

    const savedRenewalService =
      await this.customerServiceRepo.save(renewalService);

    // Create payment record for renewal
    const paymentRecord = await this.paymentRecordService.createPayment(
      {
        customer_id: customerId,
        service_id: savedRenewalService.id,
        payment_type: PaymentType.RENEWAL,
        payment_method: PaymentMethod.STRIPE,
        amount: fee,
        currency: 'USD',
        description: `Premium Membership Renewal - ${subscriptionParams.duration} months`,
        context,
      },
      paymentIntent,
    );

    // Log that renewal is pending payment and admin approval
    await this.paymentAuditService.logPaymentAction(
      paymentRecord.id,
      customerId,
      PaymentAuditAction.SUBSCRIPTION_RENEWAL_REQUESTED,
      `Premium membership renewal requested for ${subscriptionParams.duration} months`,
      {
        metadata: {
          previous_service_id: existingService.id,
          new_expiration: newExpirationDate.toISOString(),
          fee,
          duration: subscriptionParams.duration,
        },
        context,
      },
    );

    return {
      status: 'renewal_pending_payment',
      renewal_service: savedRenewalService,
      previous_service: existingService,
      payment: {
        payment_id: paymentIntent.id,
        payment_url: paymentIntent.payment_url,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        expires_at: paymentIntent.expires_at,
      },
    };
  }

  async confirmRenewalPayment(
    paymentIntentId: string,
    context?: PaymentAuditContext,
  ) {
    // Confirm payment first
    const paymentConfirmation = await this.confirmPayment(
      paymentIntentId,
      context,
    );

    if (
      paymentConfirmation.status !== 'payment_confirmed_pending_admin_approval'
    ) {
      return paymentConfirmation;
    }

    return {
      ...paymentConfirmation,
      status: 'renewal_payment_confirmed_pending_admin_approval',
      message:
        'Renewal payment confirmed successfully. Service renewal pending admin approval.',
    };
  }

  async approveRenewal(
    renewalServiceId: string,
    reviewerUserId: string,
    context?: PaymentAuditContext,
  ) {
    const renewalResult = await this.approveService(
      renewalServiceId,
      reviewerUserId,
      context,
    );

    if (renewalResult.status === 'activated') {
      // When renewal is approved, deactivate the old service
      const renewalService = renewalResult.service;

      const oldServices = await this.customerServiceRepo.find({
        where: {
          customer_id: renewalService.customer_id,
          service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
          active: true,
        },
      });

      // Filter out the newly activated service
      const servicesToDeactivate = oldServices.filter(
        (s) => s.id !== renewalService.id,
      );

      // Deactivate old services
      for (const oldService of servicesToDeactivate) {
        await this.customerServiceRepo.update(oldService.id, {
          active: false,
        });
      }

      return {
        ...renewalResult,
        status: 'renewal_activated',
        deactivated_services: servicesToDeactivate.map((s) => s.id),
      };
    }

    return renewalResult;
  }

  async rejectRenewal(
    renewalServiceId: string,
    reviewerUserId: string,
    rejectionReason?: string,
  ) {
    const rejectionResult = await this.rejectService(
      renewalServiceId,
      reviewerUserId,
      rejectionReason,
    );

    return {
      ...rejectionResult,
      status: 'renewal_rejected',
    };
  }

  async checkExpiredSubscriptions() {
    const now = new Date();

    // Find all services that are expired but not marked as expired
    const expiredServices = await this.customerServiceRepo.find({
      where: [
        {
          subscription_expires_at: LessThan(now),
          status: SubscriptionStatus.ACTIVE,
          service_type: CustomerServiceType.PREMIUM_MEMBERSHIP,
        },
      ],
      relations: ['customer'],
    });

    // Update each expired service
    const updates = expiredServices.map(async (service) => {
      await this.customerServiceRepo.update(service.id, {
        active: false,
        status: SubscriptionStatus.EXPIRED,
      });

      // Log for audit trail
      this.logger.log(
        `Subscription expired: ${service.service_type} for customer ${service.customer_id} (${service.customer?.email || 'N/A'})`,
      );

      return service.id;
    });

    const updatedIds = await Promise.all(updates);

    return {
      expired_count: expiredServices.length,
      expired_services: updatedIds,
      details: expiredServices.map((s) => ({
        service_id: s.id,
        service_type: s.service_type,
        customer_id: s.customer_id,
        customer_email: s.customer?.email,
        expired_at: s.subscription_expires_at,
      })),
    };
  }

  async getPremiumMembershipDetail(
    serviceId: string,
  ): Promise<PremiumMembershipDetail> {
    const service = await this.customerServiceRepo.findOne({
      where: { id: serviceId },
      relations: ['customer'],
      select: {
        id: true,
        customer_id: true,
        service_type: true,
        status: true,
        active: true,
        requires_payment: true,
        subscription_duration: true,
        subscription_expires_at: true,
        subscription_fee: true,
        subscription_package_id: true,
        balance: true,
        invested_amount: true,
        kyc_id: true,
        applied_at: true,
        customer: {
          id: true,
          username: true,
          email: true,
          first_name: true,
          last_name: true,
          phone_number: true,
          status: true,
          isVerify: true,
          profile: true,
          created_at: true,
          updated_at: true,
        },
      },
    });

    if (
      !service ||
      service.service_type !== CustomerServiceType.PREMIUM_MEMBERSHIP
    ) {
      throw new NotFoundException('Premium membership service not found');
    }

    const addresses = await this.customerAddressRepo.find({
      where: { customer_id: service.customer_id },
      order: { is_primary: 'DESC', created_at: 'DESC' },
    });
    const payments = await this.paymentRepo.find({
      where: { service_id: service.id },
      order: { created_at: 'DESC' },
    });
    const packageRecord = service.subscription_package_id
      ? await this.subscriptionPackageRepo.findOne({
        where: { id: service.subscription_package_id },
      })
      : null;

    const toNumber = (value: string | number | null | undefined) =>
      value === null || value === undefined ? null : Number(value);

    return {
      service: {
        id: service.id,
        service_type: service.service_type,
        status: service.status,
        active: service.active,
        requires_payment: service.requires_payment,
        applied_at: service.applied_at,
        subscription_duration: service.subscription_duration,
        subscription_fee: toNumber(service.subscription_fee),
        subscription_expires_at: service.subscription_expires_at,
        subscription_package_id: service.subscription_package_id,
        balance: payments.reduce(
          (sum, p) =>
            p.status === PaymentStatus.SUCCEEDED
              ? sum + Number(p.amount ?? 0)
              : sum,
          0,
        ),
        invested_amount: Number(service.invested_amount ?? 0),
        kyc_id: service.kyc_id,
      },
      customer: {
        id: service.customer.id,
        username: service.customer.username,
        email: service.customer.email,
        first_name: service.customer.first_name,
        last_name: service.customer.last_name,
        phone_number: service.customer.phone_number,
        status: service.customer.status,
        isVerify: service.customer.isVerify,
        profile: service.customer.profile,
        created_at: service.customer.created_at,
        updated_at: service.customer.updated_at,
      },
      package: packageRecord
        ? {
          id: packageRecord.id,
          service_type: packageRecord.service_type,
          duration_months: packageRecord.duration_months,
          price: Number(packageRecord.price),
          currency: packageRecord.currency,
          description: packageRecord.description,
          features: packageRecord.features,
          active: packageRecord.active,
        }
        : null,
      addresses: addresses.map((addr) => ({
        id: addr.id,
        address_line: addr.address_line,
        village: addr.village,
        postal_code: addr.postal_code,
        country_id: addr.country_id,
        province_id: addr.province_id,
        district_id: addr.district_id,
        is_primary: addr.is_primary,
        created_at: addr.created_at,
      })),
      payments: payments.map((payment) => ({
        id: payment.id,
        status: payment.status,
        amount: Number(payment.amount ?? 0),
        currency: payment.currency,
        payment_method: payment.payment_method,
        payment_type: payment.payment_type,
        description: payment.description,
        payment_slip_url: payment.payment_slip_url,
        payment_slip_filename: payment.payment_slip_filename,
        payment_reference: payment.payment_reference,
        admin_notes: payment.admin_notes,
        paid_at: payment.paid_at,
        created_at: payment.created_at,
        updated_at: payment.updated_at,
      })),
    };
  }

  /**
   * Get all premium membership subscriptions from customer_services table
   * This returns actual service records, not payment records
   */
  async getPremiumMembershipSubscriptions(
    options: PaginationOptions & {
      status?: string;
      search?: string;
    } = {},
  ): Promise<PaginatedResult<PremiumMembershipSubscription>> {
    const { page, limit, skip } = PaginationUtil.calculatePagination({
      page: options.page,
      limit: options.limit,
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.customerServiceRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.customer', 'c')
      .leftJoin(
        'payments',
        'p',
        'p.service_id = s.id AND p.created_at = (SELECT MAX(created_at) FROM payments WHERE service_id = s.id)',
      )
      .where('s.service_type = :stype', {
        stype: CustomerServiceType.PREMIUM_MEMBERSHIP,
      })
      .orderBy('s.applied_at', 'DESC')
      .skip(skip)
      .take(limit);

    // Filter by status (active/pending/cancelled/expired)
    if (options.status) {
      qb.andWhere('s.status = :status', {
        status: options.status.toLowerCase(),
      });
    }

    // Search by customer name, email, or username
    if (options.search) {
      qb.andWhere(
        "(c.username ILIKE :search OR c.email ILIKE :search OR c.first_name ILIKE :search OR c.last_name ILIKE :search OR CONCAT(c.first_name, ' ', c.last_name) ILIKE :search)",
        { search: `%${options.search}%` },
      );
    }

    const [services, total] = await qb.getManyAndCount();
    if (total === 0) {
      return PaginationUtil.createPaginatedResult([], total, { page, limit });
    }

    // Get latest payment status for each service
    const serviceIds = services.map((s) => s.id);
    const latestPayments = await this.paymentRepo
      .createQueryBuilder('p')
      .where('p.service_id IN (:...serviceIds)', { serviceIds })
      .andWhere(
        'p.created_at = (SELECT MAX(created_at) FROM payments WHERE service_id = p.service_id)',
      )
      .getMany();

    const paymentMap = new Map(
      latestPayments.map((p) => [p.service_id, p.status]),
    );

    const data: PremiumMembershipSubscription[] = services.map((service) => ({
      service_id: service.id,
      customer_id: service.customer_id,
      customer_info: {
        username: service.customer?.username || '',
        email: service.customer?.email || '',
        first_name: service.customer?.first_name || '',
        last_name: service.customer?.last_name || '',
      },
      service_type: service.service_type,
      active: service.active,
      subscription_duration: service.subscription_duration,
      subscription_fee: service.subscription_fee,
      subscription_expires_at: service.subscription_expires_at,
      subscription_package_id: service.subscription_package_id,
      applied_at: service.applied_at,
      latest_payment_status: paymentMap.get(service.id) || null,
      status: service.status,
    }));

    return PaginationUtil.createPaginatedResult(data, total, { page, limit });
  }

  async getPendingPremiumMemberships(
    options: PaginationOptions & {
      payment_status?: PaymentStatus;
      status?: string;
      search?: string;
    } = {},
  ): Promise<PaginatedResult<PendingPremiumMembership>> {
    const { page, limit, skip } = PaginationUtil.calculatePagination({
      page: options.page,
      limit: options.limit,
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.service', 's')
      .leftJoinAndSelect('s.customer', 'c')
      .where('s.service_type = :stype', {
        stype: CustomerServiceType.PREMIUM_MEMBERSHIP,
      })
      .orderBy('p.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    // Filter by exact payment status (takes priority)
    if (options.payment_status) {
      qb.andWhere('p.status = :status', { status: options.payment_status });
    }
    // Filter by display status group
    else if (options.status && options.status !== 'all') {
      const statusMap: Record<string, PaymentStatus[]> = {
        active: [PaymentStatus.SUCCEEDED],
        pending: [
          PaymentStatus.PENDING,
          PaymentStatus.PAYMENT_SLIP_SUBMITTED,
          PaymentStatus.PROCESSING,
        ],
        cancelled: [PaymentStatus.FAILED, PaymentStatus.CANCELED],
        expired: [PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED],
      };
      const statuses = statusMap[options.status];
      if (statuses && statuses.length > 0) {
        qb.andWhere('p.status IN (:...statuses)', { statuses });
      }
    }

    // Search by customer name, email, or username
    if (options.search) {
      qb.andWhere(
        "(c.username ILIKE :search OR c.email ILIKE :search OR c.first_name ILIKE :search OR c.last_name ILIKE :search OR CONCAT(c.first_name, ' ', c.last_name) ILIKE :search)",
        { search: `%${options.search}%` },
      );
    }

    const [payments, total] = await qb.getManyAndCount();

    const data: PendingPremiumMembership[] = payments.map((payment) => ({
      service_id: payment.service_id,
      customer_id: payment.customer_id,
      customer_info: {
        username: payment.service?.customer?.username || '',
        email: payment.service?.customer?.email || '',
        first_name: payment.service?.customer?.first_name || '',
        last_name: payment.service?.customer?.last_name || '',
      },
      service_type:
        payment.service?.service_type || CustomerServiceType.PREMIUM_MEMBERSHIP,
      subscription_duration: payment.service?.subscription_duration || null,
      subscription_fee: payment.service?.subscription_fee || null,
      applied_at: payment.service?.applied_at || payment.created_at,
      payment_info: {
        payment_id: payment.id,
        amount: payment.amount,
        paid_at: payment.paid_at || payment.updated_at,
        status: payment.status,
        payment_slip_url: payment.payment_slip_url || undefined,
      },
    }));

    return PaginationUtil.createPaginatedResult(data, total, { page, limit });
  }

  /**
   * Get pending applications for International Stock Account
   */
  async getInternationalStockAccounts(
    options: PaginationOptions & {
      kyc_status?: KycStatus;
      search?: string;
    } = {},
  ): Promise<PaginatedResult<PendingInternationalStockAccount>> {
    const { page, limit, skip } = PaginationUtil.calculatePagination({
      page: options.page,
      limit: options.limit,
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.customerServiceRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.customer', 'c')
      .leftJoinAndSelect('s.kyc', 'k')
      .leftJoin('payments', 'p', 'p.service_id = s.id')
      .where('s.service_type = :stype', {
        stype: CustomerServiceType.INTERNATIONAL_STOCK_ACCOUNT,
      })
      // .andWhere('s.active = :active', { active: false })
      .orderBy('s.applied_at', 'DESC')
      .skip(skip)
      .take(limit);

    // Filter by KYC status
    if (options.kyc_status) {
      qb.andWhere('k.status = :kycStatus', { kycStatus: options.kyc_status });
    }

    // Search by customer name, email, or username
    if (options.search) {
      qb.andWhere(
        "(c.username ILIKE :search OR c.email ILIKE :search OR c.first_name ILIKE :search OR c.last_name ILIKE :search OR CONCAT(c.first_name, ' ', c.last_name) ILIKE :search)",
        { search: `%${options.search}%` },
      );
    }

    const [services, total] = await qb.getManyAndCount();

    const data = services.map((service) => ({
      service_id: service.id,
      customer_id: service.customer_id,
      customer_info: {
        username: service.customer?.username || '',
        email: service.customer?.email || '',
        first_name: service.customer?.first_name || '',
        last_name: service.customer?.last_name || '',
        phone_number: service.customer?.phone_number || undefined,
      },
      service_type: service.service_type,
      active: service.active,
      requires_payment: service.requires_payment,
      applied_at: service.applied_at,
      kyc_info: service.kyc
        ? {
          kyc_id: service.kyc.id,
          kyc_level: service.kyc.kyc_level,
          kyc_status: service.kyc.status,
          reviewed_at: service.kyc.reviewed_at,
        }
        : undefined,
    }));

    return PaginationUtil.createPaginatedResult(data, total, { page, limit });
  }

  /**
   * Get pending applications for Guaranteed Returns
   */
  async getPendingGuaranteedReturns(
    options: PaginationOptions & {
      payment_status?: PaymentStatus;
      search?: string;
    } = {},
  ): Promise<PaginatedResult<PendingGuaranteedReturn>> {
    const { page, limit, skip } = PaginationUtil.calculatePagination({
      page: options.page,
      limit: options.limit,
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.customerServiceRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.customer', 'c')
      .leftJoinAndSelect('s.kyc', 'k')
      .leftJoin('payments', 'p', 'p.service_id = s.id')
      .addSelect(['p.id', 'p.amount', 'p.status', 'p.paid_at'])
      .where('s.service_type = :stype', {
        stype: CustomerServiceType.GUARANTEED_RETURNS,
      })
      // .andWhere('s.active = :active', { active: false })
      .orderBy('s.applied_at', 'DESC')
      .skip(skip)
      .take(limit);

    // Filter by payment status
    if (options.payment_status) {
      qb.andWhere('p.status = :paymentStatus', {
        paymentStatus: options.payment_status,
      });
    }

    // Search by customer name, email, or username
    if (options.search) {
      qb.andWhere(
        "(c.username ILIKE :search OR c.email ILIKE :search OR c.first_name ILIKE :search OR c.last_name ILIKE :search OR CONCAT(c.first_name, ' ', c.last_name) ILIKE :search)",
        { search: `%${options.search}%` },
      );
    }

    const [services, total] = await qb.getManyAndCount();

    const data = await Promise.all(
      services.map(async (service) => {
        // Get payment info
        const payments = await this.paymentRepo.find({
          where: { service_id: service.id },
          order: { created_at: 'DESC' },
          take: 1,
        });
        const latestPayment = payments[0];

        return {
          service_id: service.id,
          customer_id: service.customer_id,
          customer_info: {
            username: service.customer?.username || '',
            email: service.customer?.email || '',
            first_name: service.customer?.first_name || '',
            last_name: service.customer?.last_name || '',
            phone_number: service.customer?.phone_number || undefined,
          },
          service_type: service.service_type,
          active: service.active,
          requires_payment: service.requires_payment,
          invested_amount: service.invested_amount,
          balance: service.balance,
          applied_at: service.applied_at,
          kyc_info: service.kyc
            ? {
              kyc_id: service.kyc.id,
              kyc_level: service.kyc.kyc_level,
              kyc_status: service.kyc.status,
              reviewed_at: service.kyc.reviewed_at,
            }
            : undefined,
          payment_info: latestPayment
            ? {
              payment_id: latestPayment.id,
              amount: latestPayment.amount,
              paid_at: latestPayment.paid_at,
              status: latestPayment.status,
              payment_slip_url: latestPayment.payment_slip_url || undefined,
            }
            : undefined,
        };
      }),
    );

    return PaginationUtil.createPaginatedResult(data, total, { page, limit });
  }

  /**
   * Get all pending service applications with filters
   */
  async getAllPendingServices(
    serviceType?: CustomerServiceType,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<PendingService>> {
    const { page, limit, skip } = PaginationUtil.calculatePagination({
      page: options.page,
      limit: options.limit,
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.customerServiceRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.customer', 'c')
      .leftJoinAndSelect('s.kyc', 'k')
      .where('s.active = :active', { active: false })
      .orderBy('s.applied_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (serviceType) {
      qb.andWhere('s.service_type = :stype', { stype: serviceType });
    }

    const [services, total] = await qb.getManyAndCount();

    const data = await Promise.all(
      services.map(async (service): Promise<PendingService> => {
        // Get payment info if service requires payment
        let paymentInfo:
          | {
            payment_id: string;
            amount: number;
            paid_at: Date | null;
            status: PaymentStatus;
            payment_slip_url?: string;
          }
          | undefined;
        if (service.requires_payment) {
          const payments = await this.paymentRepo.find({
            where: { service_id: service.id },
            order: { created_at: 'DESC' },
            take: 1,
          });
          const latestPayment = payments[0];
          if (latestPayment) {
            paymentInfo = {
              payment_id: latestPayment.id,
              amount: latestPayment.amount,
              paid_at: latestPayment.paid_at,
              status: latestPayment.status,
              payment_slip_url: latestPayment.payment_slip_url || undefined,
            };
          }
        }

        return {
          service_id: service.id,
          customer_id: service.customer_id,
          customer_info: {
            username: service.customer?.username || '',
            email: service.customer?.email || '',
            first_name: service.customer?.first_name || '',
            last_name: service.customer?.last_name || '',
            phone_number: service.customer?.phone_number || undefined,
          },
          service_type: service.service_type,
          active: service.active,
          requires_payment: service.requires_payment,
          subscription_duration: service.subscription_duration,
          subscription_fee: service.subscription_fee,
          subscription_expires_at: service.subscription_expires_at,
          invested_amount: service.invested_amount,
          balance: service.balance,
          applied_at: service.applied_at,
          kyc_info: service.kyc
            ? {
              kyc_id: service.kyc.id,
              kyc_level: service.kyc.kyc_level,
              kyc_status: service.kyc.status,
              reviewed_at: service.kyc.reviewed_at,
            }
            : undefined,
          payment_info: paymentInfo,
        };
      }),
    );

    return PaginationUtil.createPaginatedResult(data, total, { page, limit });
  }

  /**
   * Get service application statistics
   */
  async getServiceStats(): Promise<ServiceStats> {
    const serviceTypes = Object.values(CustomerServiceType);

    const statsByService = await Promise.all(
      serviceTypes.map(async (serviceType) => {
        // Count pending
        const totalPending = await this.customerServiceRepo.count({
          where: { service_type: serviceType, active: false },
        });

        // Count pending with payment
        const pendingWithPayment = await this.customerServiceRepo
          .createQueryBuilder('s')
          .leftJoin('payments', 'p', 'p.service_id = s.id')
          .where('s.service_type = :stype', { stype: serviceType })
          .andWhere('s.active = false')
          .andWhere('p.status IN (:...statuses)', {
            statuses: [
              PaymentStatus.SUCCEEDED,
              PaymentStatus.PAYMENT_SLIP_SUBMITTED,
            ],
          })
          .getCount();

        // Count pending KYC
        const pendingKyc = await this.customerServiceRepo
          .createQueryBuilder('s')
          .leftJoin('customer_kyc', 'k', 'k.id = s.kyc_id')
          .where('s.service_type = :stype', { stype: serviceType })
          .andWhere('s.active = false')
          .andWhere('k.status = :kycStatus', { kycStatus: KycStatus.PENDING })
          .getCount();

        // Count approved this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const approvedThisMonth = await this.customerServiceRepo.count({
          where: {
            service_type: serviceType,
            active: true,
            applied_at: MoreThan(startOfMonth),
          },
        });

        return {
          service_type: serviceType,
          total_pending: totalPending,
          pending_with_payment: pendingWithPayment,
          pending_kyc_review: pendingKyc,
          approved_this_month: approvedThisMonth,
          rejected_this_month: 0, // Would need rejection tracking
          avg_approval_time_hours: null, // Would need approval timestamp tracking
        };
      }),
    );

    const totalPending = statsByService.reduce(
      (sum, stat) => sum + stat.total_pending,
      0,
    );
    const totalActive = await this.customerServiceRepo.count({
      where: { active: true },
    });

    return {
      by_service: statsByService,
      total_pending: totalPending,
      total_active: totalActive,
    };
  }

  private getApprovalNotificationBuilder(type: CustomerServiceType) {
    switch (type) {
      case CustomerServiceType.PREMIUM_MEMBERSHIP:
        return buildPremiumMembershipApprovalNotification;
      case CustomerServiceType.INTERNATIONAL_STOCK_ACCOUNT:
        return buildStockAccountApprovalNotification;
      case CustomerServiceType.GUARANTEED_RETURNS:
        return buildGuaranteedReturnsApprovalNotification;
      default:
        return null;
    }
  }

  /**
   * Get detailed information for any service application
   * Returns complete service, customer, KYC, payment, and document info
   */
  async getServiceDetail(serviceId: string) {
    const service = await this.customerServiceRepo.findOne({
      where: { id: serviceId },
      relations: ['customer'],
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    // Get KYC info if exists
    let kycInfo: ServiceDetailKycInfo | null = null;
    if (service.kyc_id) {
      const kyc = await this.customerKycRepo.findOne({
        where: { id: service.kyc_id },
      });
      if (kyc) {
        kycInfo = {
          kyc_id: kyc.id,
          kyc_status: kyc.status,
          kyc_level: kyc.kyc_level,
          dob: kyc.dob,
          nationality: kyc.nationality,
          marital_status: kyc.marital_status,
          employment_status: kyc.employment_status,
          annual_income: kyc.annual_income,
          employer_name: kyc.employer_name,
          occupation: kyc.occupation,
          investment_experience: kyc.investment_experience,
          dependent_number: kyc.dependent_number,
          source_of_funds: kyc.source_of_funds,
          risk_tolerance: kyc.risk_tolerance,
          pep_flag: kyc.pep_flag,
          tax_id: kyc.tax_id,
          fatca_status: kyc.fatca_status,
          reviewed_by: kyc.reviewed_by,
          reviewed_at: kyc.reviewed_at,
          rejection_reason: kyc.rejection_reason,
          created_at: kyc.created_at,
          updated_at: kyc.updated_at,
        };
      }
    }

    // Get payment info if service requires payment
    let paymentInfo: ServiceDetailPaymentInfo | null = null;
    if (service.requires_payment) {
      const payment = await this.paymentRepo.findOne({
        where: { service_id: service.id },
        order: { created_at: 'DESC' },
      });
      if (payment) {
        paymentInfo = {
          payment_id: payment.id,
          status: payment.status,
          amount: Number(payment.amount ?? 0),
          currency: payment.currency,
          payment_method: payment.payment_method,
          payment_type: payment.payment_type,
          payment_slip_url: payment.payment_slip_url,
          payment_slip_filename: payment.payment_slip_filename,
          payment_reference: payment.payment_reference,
          admin_notes: payment.admin_notes,
          paid_at: payment.paid_at,
          created_at: payment.created_at,
          updated_at: payment.updated_at,
        };
      }
    }

    // Get subscription package if exists
    let packageInfo: ServiceDetailPackageInfo | null = null;
    if (service.subscription_package_id) {
      const pkg = await this.subscriptionPackageRepo.findOne({
        where: { id: service.subscription_package_id },
      });
      if (pkg) {
        packageInfo = {
          id: pkg.id,
          service_type: pkg.service_type,
          duration_months: pkg.duration_months,
          price: Number(pkg.price),
          currency: pkg.currency,
          description: pkg.description,
          features: pkg.features,
        };
      }
    }

    return {
      service_id: service.id,
      customer_id: service.customer_id,
      service_type: service.service_type,
      status: service.status,
      active: service.active,
      requires_payment: service.requires_payment,
      applied_at: service.applied_at,
      subscription_duration: service.subscription_duration,
      subscription_expires_at: service.subscription_expires_at,
      subscription_fee: service.subscription_fee
        ? Number(service.subscription_fee)
        : null,
      balance: service.balance ? Number(service.balance) : null,
      invested_amount: service.invested_amount
        ? Number(service.invested_amount)
        : null,
      kyc_info: kycInfo,
      payment_info: paymentInfo,
      package_info: packageInfo,
    };
  }
}
