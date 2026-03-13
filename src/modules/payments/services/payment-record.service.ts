import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Payment,
  PaymentStatus,
  PaymentMethod,
  PaymentType,
} from '../entities/payment.entity';
import { CustomerService } from '../../customers/entities/customer-service.entity';
import type { PaymentIntent } from './payment.service';
import {
  PaymentAuditService,
  PaymentAuditContext,
  PaymentAuditAction,
} from './payment-audit.service';

export interface CreatePaymentDto {
  customer_id: string;
  service_id?: string;
  payment_type: PaymentType;
  payment_method: PaymentMethod;
  amount: number;
  currency?: string;
  description?: string;
  context?: PaymentAuditContext;
}

@Injectable()
export class PaymentRecordService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(CustomerService)
    private readonly serviceRepo: Repository<CustomerService>,
    private readonly paymentAuditService: PaymentAuditService,
  ) { }

  async createPayment(
    createPaymentDto: CreatePaymentDto,
    paymentIntent: PaymentIntent,
  ): Promise<Payment> {
    const payment = this.paymentRepo.create({
      customer_id: createPaymentDto.customer_id,
      service_id: createPaymentDto.service_id,
      payment_intent_id: paymentIntent.id,
      payment_type: createPaymentDto.payment_type,
      payment_method: createPaymentDto.payment_method,
      status: PaymentStatus.PENDING,
      amount: createPaymentDto.amount,
      currency: createPaymentDto.currency || 'USD',
      description: createPaymentDto.description,
      external_payment_id: paymentIntent.id,
      payment_url: paymentIntent.payment_url,
      payment_url_expires_at: paymentIntent.expires_at,
      payment_metadata: paymentIntent.metadata,
    });

    const savedPayment = await this.paymentRepo.save(payment);

    await this.paymentAuditService.logPaymentCreated(
      savedPayment.id,
      createPaymentDto.customer_id,
      {
        payment_type: createPaymentDto.payment_type,
        payment_method: createPaymentDto.payment_method,
        amount: createPaymentDto.amount,
        currency: createPaymentDto.currency || 'USD',
        service_id: createPaymentDto.service_id,
      },
      createPaymentDto.context,
    );

    if (paymentIntent.payment_url) {
      await this.paymentAuditService.logPaymentUrlGenerated(
        savedPayment.id,
        createPaymentDto.customer_id,
        paymentIntent.payment_url,
        paymentIntent.expires_at,
        createPaymentDto.context,
      );
    }

    return savedPayment;
  }

  async updatePaymentStatus(
    paymentIntentId: string,
    status: PaymentStatus,
    additionalData?: {
      external_payment_id?: string;
      failure_reason?: string;
      provider_response?: Record<string, unknown>;
      context?: PaymentAuditContext;
    },
  ): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({
      where: { payment_intent_id: paymentIntentId },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    const previousStatus = payment.status;
    payment.status = status;

    switch (status) {
      case PaymentStatus.SUCCEEDED:
        payment.paid_at = new Date();
        await this.paymentAuditService.logPaymentSucceeded(
          payment.id,
          payment.customer_id,
          payment.amount,
          payment.currency,
          additionalData?.context,
        );
        break;
      case PaymentStatus.FAILED:
        payment.failed_at = new Date();
        if (additionalData?.failure_reason) {
          payment.failure_reason = additionalData.failure_reason;
        }
        await this.paymentAuditService.logPaymentFailed(
          payment.id,
          payment.customer_id,
          additionalData?.failure_reason || 'Unknown failure reason',
          additionalData?.context,
        );
        break;
      case PaymentStatus.CANCELED:
        payment.canceled_at = new Date();
        await this.paymentAuditService.logPaymentCanceled(
          payment.id,
          payment.customer_id,
          'Payment canceled by user or system',
          additionalData?.context,
        );
        break;
    }

    if (additionalData?.external_payment_id) {
      payment.external_payment_id = additionalData.external_payment_id;
    }
    if (additionalData?.provider_response) {
      payment.provider_response = additionalData.provider_response;
    }

    const updatedPayment = await this.paymentRepo.save(payment);

    if (
      ![
        PaymentStatus.SUCCEEDED,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELED,
      ].includes(status)
    ) {
      await this.paymentAuditService.logPaymentAction(
        payment.id,
        payment.customer_id,
        status === PaymentStatus.PROCESSING
          ? PaymentAuditAction.PAYMENT_PROCESSING
          : PaymentAuditAction.PAYMENT_INITIATED,
        `Payment status changed from ${previousStatus} to ${status}`,
        {
          metadata: { previous_status: previousStatus, new_status: status },
          context: additionalData?.context,
        },
      );
    }
    return updatedPayment;
  }

  async createRefund(
    paymentId: string,
    refundAmount: number,
    refundReason?: string,
    context?: PaymentAuditContext,
  ): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new BadRequestException('Can only refund successful payments');
    }
    const currentRefunded = payment.refunded_amount || 0;
    const totalRefunded = currentRefunded + refundAmount;
    if (totalRefunded > payment.amount) {
      throw new BadRequestException('Refund amount exceeds payment amount');
    }
    payment.refunded_amount = totalRefunded;
    payment.refunded_at = new Date();
    if (refundReason) payment.refund_reason = refundReason;
    payment.status =
      totalRefunded === payment.amount
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED;
    const updated = await this.paymentRepo.save(payment);
    await this.paymentAuditService.logPaymentRefunded(
      payment.id,
      payment.customer_id,
      refundAmount,
      refundReason,
      context,
    );
    return updated;
  }

  async getPaymentsByCustomer(customerId: string): Promise<Payment[]> {
    return this.paymentRepo.find({
      where: { customer_id: customerId },
      order: { created_at: 'DESC' },
      relations: ['service'],
    });
  }

  async getPaymentsByService(
    serviceId: string,
    status?: PaymentStatus,
  ): Promise<Payment[]> {
    return this.paymentRepo.find({
      where: { service_id: serviceId, ...(status && { status }) },
      order: { created_at: 'DESC' },
    });
  }

  async getPaymentByIntentId(paymentIntentId: string): Promise<Payment | null> {
    return this.paymentRepo.findOne({
      where: { payment_intent_id: paymentIntentId },
      relations: ['service', 'customer'],
    });
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
    const qb = this.paymentRepo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.service', 'service')
      .leftJoinAndSelect('payment.subscription_package', 'subscription_package')
      .where('payment.customer_id = :customerId', { customerId });

    if (options?.status) {
      qb.andWhere('payment.status = :status', { status: options.status });
    }

    if (options?.payment_type) {
      qb.andWhere('payment.payment_type = :payment_type', {
        payment_type: options.payment_type,
      });
    }

    if (options?.startDate) {
      qb.andWhere('payment.created_at >= :startDate', {
        startDate: options.startDate,
      });
    }

    if (options?.endDate) {
      qb.andWhere('payment.created_at <= :endDate', {
        endDate: options.endDate,
      });
    }

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const [payments, total] = await qb
      .orderBy('payment.created_at', 'DESC')
      .limit(limit)
      .offset(offset)
      .getManyAndCount();

    return { payments, total, limit, offset };
  }
}
