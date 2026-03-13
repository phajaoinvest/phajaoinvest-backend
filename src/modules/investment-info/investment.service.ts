import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  EntityManager,
  Between,
  MoreThanOrEqual,
  LessThanOrEqual,
  FindOptionsWhere,
} from 'typeorm';
import {
  InvestmentRequest,
  InvestmentRequestStatus,
} from './entities/investment-request.entity';
import { CustomerInvestmentSummary } from './entities/customer-investment.entity';
import {
  InvestmentTransaction,
  TransactionType,
  ReturnRequestType,
  ReturnRequestStatus,
} from './entities/investment-transaction.entity';
import { CustomerService } from '../customers/entities/customer-service.entity';
import { CustomerServiceType } from '../customers/entities/customer-service.entity';
import { DatabaseInterestRateService } from './database-interest-rate.service';
import { RiskTolerance } from './entities/interest-rate-configuration.entity';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildInvestmentRequestNotification,
  buildInvestmentApprovalNotification,
  buildReturnRequestNotification,
  buildReturnApprovalNotification,
} from '../notifications/utils/notification-builders';

// Updated DTOs to include form fields
interface CreateInvestmentRequestDto {
  customer_id: string;
  service_id?: string;
  amount: number;
  payment_slip_url: string;
  payment_date?: Date;
  customer_notes?: string;
  // Form fields from your photo
  requested_investment_period?: string;
  requested_risk_tolerance?: string;
  requested_investment_goal?: string;
}

interface CreateReturnRequestDto {
  customer_id: string;
  investment_transaction_id?: string; // Specific investment transaction
  request_type: ReturnRequestType;
  requested_amount: number;
  customer_reason?: string;
}

@Injectable()
export class InvestmentService {
  constructor(
    @InjectRepository(InvestmentRequest)
    private readonly requestRepo: Repository<InvestmentRequest>,
    @InjectRepository(CustomerInvestmentSummary)
    private readonly summaryRepo: Repository<CustomerInvestmentSummary>,
    @InjectRepository(InvestmentTransaction)
    private readonly transactionRepo: Repository<InvestmentTransaction>,
    @InjectRepository(CustomerService)
    private readonly serviceRepo: Repository<CustomerService>,
    private readonly dataSource: DataSource,
    private readonly databaseInterestRateService: DatabaseInterestRateService,
    private readonly notificationsService: NotificationsService,
  ) { }

  // === FLOW 1: Customer submits investment request with payment slip ===
  async createInvestmentRequest(dto: CreateInvestmentRequestDto) {
    if (dto.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    return this.dataSource.transaction(async (manager) => {
      // Parse risk tolerance from the form or default to medium
      const riskTolerance: RiskTolerance = this.parseRiskTolerance(
        dto.requested_risk_tolerance,
      );

      // Format the database interest rate calculation result
      const interestRateResult =
        await this.databaseInterestRateService.calculateInterestRate(
          dto.amount,
          riskTolerance,
        );

      if (!interestRateResult) {
        throw new BadRequestException(
          `No interest rate configuration found for amount $${dto.amount.toLocaleString()} with ${riskTolerance} risk tolerance`,
        );
      }

      // Verify service exists
      const serviceRepo = manager.getRepository(CustomerService);
      const service = await serviceRepo.findOne({
        where: {
          customer_id: dto.customer_id,
          service_type: CustomerServiceType.GUARANTEED_RETURNS,
          active: true,
        },
      });

      if (!service) {
        throw new NotFoundException(
          'Active guaranteed returns service not found',
        );
      }

      // Override service_id to ensure it matches the verified service
      dto.service_id = service.id;

      // Create investment request within transaction
      const requestRepo = manager.getRepository(InvestmentRequest);
      const request = requestRepo.create({
        customer_id: dto.customer_id,
        service_id: dto.service_id,
        payment_slip_url: dto.payment_slip_url,
        amount: dto.amount.toString(),
        payment_date: dto.payment_date || new Date(),
        customer_notes: dto.customer_notes,
        // Save form selections
        requested_investment_period: dto.requested_investment_period,
        requested_risk_tolerance: dto.requested_risk_tolerance,
        requested_investment_goal: dto.requested_investment_goal,
        // Auto-calculated tier information from database
        calculated_tier: interestRateResult.tier_name,
        calculated_interest_rate: interestRateResult.final_rate.toString(),
        approved_interest_config_id: interestRateResult.config_id,
        status: InvestmentRequestStatus.PENDING,
      });

      const saved = await requestRepo.save(request);

      // Notify admins about investment request
      manager.getRepository('Customer').findOne({ where: { id: dto.customer_id } }).then((customer: any) => {
        if (customer) {
          void this.notificationsService.createNotification(
            buildInvestmentRequestNotification(
              {
                customerId: customer.id,
                customerName: customer.username,
                customerEmail: customer.email,
              },
              saved.id,
              dto.amount,
            ),
          );
        }
      });

      // Update customer summary within transaction
      await this.updateCustomerSummaryInTransaction(
        manager,
        dto.customer_id,
        dto.service_id,
        {
          type: 'request_created',
        },
      );

      return {
        request_id: saved.id,
        status: 'pending_admin_review',
        calculated_tier: interestRateResult.tier_name,
        calculated_interest_rate: interestRateResult.final_rate,
        risk_tolerance: interestRateResult.risk_tolerance,
        base_rate: interestRateResult.base_rate,
        risk_adjustment: interestRateResult.risk_adjustment,
        tier_description: interestRateResult.description,
        message: `Investment request submitted successfully. ${interestRateResult.description}`,
      };
    });
  }

  // === FLOW 2: Admin approves investment request ===
  async approveInvestmentRequest(
    requestId: string,
    adminId: string,
    approvalData: {
      admin_notes?: string;
    },
  ) {
    return this.dataSource.transaction(async (manager) => {
      const requestRepo = manager.getRepository(InvestmentRequest);
      const transactionRepo = manager.getRepository(InvestmentTransaction);

      const request = await requestRepo.findOne({
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!request) {
        throw new NotFoundException('Investment request not found');
      }
      if (request.status !== InvestmentRequestStatus.PENDING) {
        throw new BadRequestException('Only pending requests can be approved');
      }

      // Determine final interest rate strictly from configuration
      if (!request.calculated_interest_rate) {
        throw new BadRequestException('Calculated interest rate is missing');
      }
      const finalInterestRate = Number(request.calculated_interest_rate);

      // Resolve linked interest rate configuration id from request
      // Prefer the config id saved during request creation; otherwise recompute
      let configId = request.approved_interest_config_id;
      if (!configId) {
        const rt = this.parseRiskTolerance(
          request.requested_risk_tolerance || undefined,
        );
        const calc =
          await this.databaseInterestRateService.calculateInterestRate(
            Number(request.amount),
            rt,
          );
        if (calc?.config_id) {
          configId = calc.config_id;
          request.approved_interest_config_id = configId;
        }
      }

      // Infer term from requested_investment_period (e.g., "12 months")
      let inferredTerm: number | null = null;
      if (request.requested_investment_period) {
        const match = request.requested_investment_period.match(/(\d+)/);
        inferredTerm = match ? Number(match[1]) : null;
      }

      // Update request
      request.status = InvestmentRequestStatus.APPROVED;
      request.reviewed_by = adminId;
      request.reviewed_at = new Date();
      request.approved_interest_rate = finalInterestRate.toString();
      request.approved_term_months = inferredTerm;
      // NOTE: approved_interest_config_id is captured from calculation
      request.admin_notes = approvalData.admin_notes || null;
      await requestRepo.save(request);

      // Create individual investment transaction
      const startDate = new Date();
      const transaction = transactionRepo.create({
        request_id: request.id,
        customer_id: request.customer_id,
        transaction_type: TransactionType.INVESTMENT_APPROVED,
        amount: request.amount,
        effective_date: startDate,
        description: `Investment approved - ${request.calculated_tier?.toUpperCase()} tier (${(finalInterestRate * 100).toFixed(1)}%)`,
        investment_principal: request.amount,
        current_principal: request.amount,
        interest_rate: finalInterestRate.toString(),
        investment_start_date: startDate,
        term_months: inferredTerm,
        created_by: adminId,
        // Persist the selected interest rate configuration id
        interest_rate_config_id: configId || null,
      });
      await transactionRepo.save(transaction);

      // Notify customer about approval
      manager.getRepository('Customer').findOne({ where: { id: request.customer_id } }).then((customer: any) => {
        if (customer) {
          void this.notificationsService.createNotification(
            buildInvestmentApprovalNotification(
              {
                customerId: customer.id,
                customerName: customer.username,
                customerEmail: customer.email,
              },
              {
                adminId: adminId,
              },
              request.id,
              Number(request.amount),
              true,
            ),
          );
        }
      });

      // Update customer summary within transaction
      await this.updateCustomerSummaryInTransaction(
        manager,
        request.customer_id,
        request.service_id,
        {
          type: 'investment_approved',
          amount: Number(request.amount),
        },
      );

      return {
        transaction_id: transaction.id,
        approved_tier: request.calculated_tier,
        approved_interest_rate: finalInterestRate,
        tier_description: `${request.calculated_tier?.toUpperCase()} tier - ${(finalInterestRate * 100).toFixed(1)}% returns`,
        message: 'Investment approved and created successfully',
      };
    });
  }

  // === FLOW 2b: Admin rejects investment request ===
  async rejectInvestmentRequest(
    requestId: string,
    adminId: string,
    rejectionData: { admin_notes?: string },
  ) {
    return this.dataSource.transaction(async (manager) => {
      const requestRepo = manager.getRepository(InvestmentRequest);

      const request = await requestRepo.findOne({
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!request) {
        throw new NotFoundException('Investment request not found');
      }
      if (request.status !== InvestmentRequestStatus.PENDING) {
        throw new BadRequestException(
          'Request is not pending. Current status: ' + request.status,
        );
      }

      // Update request status to rejected
      request.status = InvestmentRequestStatus.REJECTED;
      request.reviewed_by = adminId;
      request.reviewed_at = new Date();
      request.admin_notes = rejectionData.admin_notes || null;
      await requestRepo.save(request);

      // Notify customer about rejection
      manager.getRepository('Customer').findOne({ where: { id: request.customer_id } }).then((customer: any) => {
        if (customer) {
          void this.notificationsService.createNotification(
            buildInvestmentApprovalNotification(
              {
                customerId: customer.id,
                customerName: customer.username,
                customerEmail: customer.email,
              },
              {
                adminId: adminId,
              },
              request.id,
              Number(request.amount),
              false,
              rejectionData.admin_notes || undefined,
            ),
          );
        }
      });

      return {
        request_id: request.id,
        status: 'rejected',
        message: 'Investment request rejected successfully',
      };
    });
  }

  // === FLOW 3: Customer requests money return ===
  async createReturnRequest(dto: CreateReturnRequestDto) {
    if (dto.requested_amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    return this.dataSource.transaction(async (manager) => {
      const transactionRepo = manager.getRepository(InvestmentTransaction);

      // If specific investment, validate it within transaction
      if (dto.investment_transaction_id) {
        const investment = await transactionRepo.findOne({
          where: {
            id: dto.investment_transaction_id,
            customer_id: dto.customer_id,
            transaction_type: TransactionType.INVESTMENT_APPROVED,
          },
          lock: { mode: 'pessimistic_read' },
        });

        if (!investment) {
          throw new NotFoundException('Investment not found');
        }
        if (Number(investment.current_principal || 0) <= 0) {
          throw new BadRequestException(
            'Investment has no remaining principal',
          );
        }

        // Validate return amount doesn't exceed available principal for principal returns
        if (
          dto.request_type !== ReturnRequestType.INTEREST_ONLY &&
          dto.requested_amount > Number(investment.current_principal || 0)
        ) {
          throw new BadRequestException(
            `Requested amount $${dto.requested_amount.toLocaleString()} exceeds available principal $${Number(investment.current_principal || 0).toLocaleString()}`,
          );
        }
      }

      const transactionData = {
        request_id: dto.investment_transaction_id,
        customer_id: dto.customer_id,
        transaction_type: TransactionType.RETURN_REQUEST,
        amount: dto.requested_amount.toString(),
        effective_date: new Date(),
        description: `Customer return request - ${dto.request_type}`,
        return_request_type: dto.request_type,
        return_request_status: ReturnRequestStatus.PENDING,
        customer_reason: dto.customer_reason,
      };

      const transaction = transactionRepo.create(transactionData);
      const saved = await transactionRepo.save(transaction);

      // Notify admins about return request
      manager.getRepository('Customer').findOne({ where: { id: dto.customer_id } }).then((customer: any) => {
        if (customer) {
          void this.notificationsService.createNotification(
            buildReturnRequestNotification(
              {
                customerId: customer.id,
                customerName: customer.username,
                customerEmail: customer.email,
              },
              saved.id,
              dto.requested_amount,
              dto.request_type,
            ),
          );
        }
      });

      return {
        transaction_id: saved.id,
        status: 'pending_admin_review',
        message: 'Return request submitted successfully',
      };
    });
  }

  // === FLOW 4: Admin approves return request ===
  async approveReturnRequest(
    transactionId: string,
    adminId: string,
    approvalData: {
      approved_amount?: number;
      payment_method: string;
      payment_reference: string;
      admin_notes?: string;
    },
  ) {
    return this.dataSource.transaction(async (manager) => {
      const transactionRepo = manager.getRepository(InvestmentTransaction);

      const transaction = await transactionRepo.findOne({
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!transaction) {
        throw new NotFoundException('Return request not found');
      }
      if (transaction.return_request_status !== ReturnRequestStatus.PENDING) {
        throw new BadRequestException('Only pending requests can be approved');
      }

      const approvedAmount =
        approvalData.approved_amount || Number(transaction.amount);

      // Validate approved amount
      if (approvedAmount <= 0) {
        throw new BadRequestException('Approved amount must be greater than 0');
      }

      // Update return request
      transaction.return_request_status = ReturnRequestStatus.APPROVED;
      transaction.reviewed_by = adminId;
      transaction.reviewed_at = new Date();
      transaction.amount = approvedAmount.toString();
      transaction.admin_notes = approvalData.admin_notes || null;
      await transactionRepo.save(transaction);

      // Update individual investment if linked
      if (transaction.request_id) {
        const investment = await transactionRepo.findOne({
          where: {
            request_id: transaction.request_id,
            transaction_type: TransactionType.INVESTMENT_APPROVED,
          },
          lock: { mode: 'pessimistic_write' },
        });

        if (investment) {
          if (
            transaction.return_request_type !== ReturnRequestType.INTEREST_ONLY
          ) {
            // Principal return - reduce current principal
            const currentPrincipal = Number(investment.current_principal || 0);
            if (approvedAmount > currentPrincipal) {
              throw new BadRequestException(
                `Approved amount $${approvedAmount.toLocaleString()} exceeds available principal $${currentPrincipal.toLocaleString()}`,
              );
            }

            const newPrincipal = currentPrincipal - approvedAmount;
            investment.current_principal = Math.max(0, newPrincipal).toString();
            await transactionRepo.save(investment);
          }
        }
      }

      // Create approval transaction
      const approvalTransaction = transactionRepo.create({
        request_id: transaction.request_id,
        customer_id: transaction.customer_id,
        transaction_type: TransactionType.RETURN_APPROVED,
        amount: approvedAmount.toString(),
        effective_date: new Date(),
        description: `Return approved - ${transaction.return_request_type}`,
        payment_method: approvalData.payment_method,
        payment_reference: approvalData.payment_reference,
        created_by: adminId,
      });
      await transactionRepo.save(approvalTransaction);

      // Notify customer about approval
      manager.getRepository('Customer').findOne({ where: { id: transaction.customer_id } }).then((customer: any) => {
        if (customer) {
          void this.notificationsService.createNotification(
            buildReturnApprovalNotification(
              {
                customerId: customer.id,
                customerName: customer.username,
                customerEmail: customer.email,
              },
              {
                adminId: adminId,
              },
              transaction.id,
              approvedAmount,
              true,
            ),
          );
        }
      });

      // Update customer summary within transaction
      const summaryRepo = manager.getRepository(CustomerInvestmentSummary);
      const summary = await summaryRepo.findOne({
        where: { customer_id: transaction.customer_id },
        lock: { mode: 'pessimistic_read' },
      });

      if (summary) {
        await this.updateCustomerSummaryInTransaction(
          manager,
          transaction.customer_id,
          summary.service_id,
          {
            type:
              transaction.return_request_type ===
              ReturnRequestType.INTEREST_ONLY
                ? 'interest_paid'
                : 'principal_returned',
            amount: approvedAmount,
          },
        );
      }

      return {
        message: 'Return request approved successfully',
        approved_amount: approvedAmount,
        transaction_type: transaction.return_request_type,
      };
    });
  }

  // === FLOW 4b: Admin rejects return request ===
  async rejectReturnRequest(
    transactionId: string,
    adminId: string,
    rejectionData: { reason?: string },
  ) {
    return this.dataSource.transaction(async (manager) => {
      const transactionRepo = manager.getRepository(InvestmentTransaction);

      const transaction = await transactionRepo.findOne({
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!transaction) {
        throw new NotFoundException('Return request not found');
      }
      if (
        transaction.transaction_type !== TransactionType.RETURN_REQUEST ||
        transaction.return_request_status !== ReturnRequestStatus.PENDING
      ) {
        throw new BadRequestException(
          'Only pending return requests can be rejected',
        );
      }

      // Update status to rejected
      transaction.return_request_status = ReturnRequestStatus.REJECTED;
      transaction.description = rejectionData.reason
        ? `Return rejected: ${rejectionData.reason}`
        : 'Return request rejected by admin';
      await transactionRepo.save(transaction);

      // Notify customer about rejection
      manager.getRepository('Customer').findOne({ where: { id: transaction.customer_id } }).then((customer: any) => {
        if (customer) {
          void this.notificationsService.createNotification(
            buildReturnApprovalNotification(
              {
                customerId: customer.id,
                customerName: customer.username,
                customerEmail: customer.email,
              },
              {
                adminId: adminId,
              },
              transaction.id,
              Number(transaction.amount),
              false,
              rejectionData.reason,
            ),
          );
        }
      });

      return {
        transaction_id: transaction.id,
        status: 'rejected',
        message: 'Return request rejected successfully',
      };
    });
  }

  // === FLOW 5: Admin marks payment as sent ===
  async markReturnAsPaid(transactionId: string, adminId: string) {
    return this.dataSource.transaction(async (manager) => {
      const transactionRepo = manager.getRepository(InvestmentTransaction);

      const transaction = await transactionRepo.findOne({
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }
      if (transaction.return_request_status !== ReturnRequestStatus.APPROVED) {
        throw new BadRequestException(
          'Only approved returns can be marked as paid',
        );
      }

      transaction.return_request_status = ReturnRequestStatus.PAID;
      await transactionRepo.save(transaction);

      // Create payment confirmation transaction
      const paidTransaction = transactionRepo.create({
        request_id: transaction.request_id,
        customer_id: transaction.customer_id,
        transaction_type: TransactionType.RETURN_PAID,
        amount: transaction.amount,
        effective_date: new Date(),
        description: `Payment sent - ${transaction.return_request_type}`,
        payment_method: transaction.payment_method,
        payment_reference: transaction.payment_reference,
        created_by: adminId,
      });
      await transactionRepo.save(paidTransaction);

      return {
        message: 'Return marked as paid successfully',
        transaction_id: paidTransaction.id,
      };
    });
  }

  // === Helper method to update customer summary (with transaction manager) ===
  private async updateCustomerSummaryInTransaction(
    manager: EntityManager,
    customerId: string,
    serviceId: string,
    update: {
      type:
        | 'request_created'
        | 'investment_approved'
        | 'interest_paid'
        | 'principal_returned';
      amount?: number;
    },
  ) {
    const summaryRepo = manager.getRepository(CustomerInvestmentSummary);

    let summary = await summaryRepo.findOne({
      where: { customer_id: customerId, service_id: serviceId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!summary) {
      summary = summaryRepo.create({
        customer_id: customerId,
        service_id: serviceId,
        total_investment_requests: 0,
        approved_investments: 0,
        active_investments: 0,
        completed_investments: 0,
        total_original_investment: '0.00',
        total_current_balance: '0.00',
        total_interest_earned: '0.00',
        total_interest_paid: '0.00',
        total_principal_returned: '0.00',
        outstanding_interest: '0.00',
      });
    }

    switch (update.type) {
      case 'request_created':
        summary.total_investment_requests += 1;
        if (!summary.first_investment_date) {
          summary.first_investment_date = new Date();
        }
        summary.last_investment_date = new Date();
        break;

      case 'investment_approved':
        if (update.amount) {
          summary.approved_investments += 1;
          summary.active_investments += 1;
          summary.total_original_investment = (
            Number(summary.total_original_investment) + update.amount
          ).toString();
          summary.total_current_balance = (
            Number(summary.total_current_balance) + update.amount
          ).toString();
        }
        break;

      case 'interest_paid':
        if (update.amount) {
          summary.total_interest_paid = (
            Number(summary.total_interest_paid) + update.amount
          ).toString();
        }
        break;

      case 'principal_returned':
        if (update.amount) {
          summary.total_principal_returned = (
            Number(summary.total_principal_returned) + update.amount
          ).toString();
          summary.total_current_balance = (
            Number(summary.total_current_balance) - update.amount
          ).toString();
        }
        break;
    }

    await summaryRepo.save(summary);
  }

  // === Helper method to update customer summary ===
  private async updateCustomerSummary(
    customerId: string,
    serviceId: string,
    update: {
      type:
        | 'request_created'
        | 'investment_approved'
        | 'interest_paid'
        | 'principal_returned';
      amount?: number;
    },
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.updateCustomerSummaryInTransaction(
        manager,
        customerId,
        serviceId,
        update,
      );
    });
  }

  // === Query methods ===
  async listPendingRequests() {
    return this.requestRepo.find({
      where: { status: InvestmentRequestStatus.PENDING },
      relations: ['customer'],
      order: { created_at: 'DESC' },
    });
  }

  async listPendingReturns() {
    return this.transactionRepo.find({
      where: {
        transaction_type: TransactionType.RETURN_REQUEST,
        return_request_status: ReturnRequestStatus.PENDING,
      },
      relations: ['customer', 'request'],
      order: { created_at: 'DESC' },
    });
  }

  async getCustomerSummary(customerId: string, serviceId: string) {
    return this.summaryRepo.findOne({
      where: { customer_id: customerId, service_id: serviceId },
      relations: ['customer', 'service'],
    });
  }

  /**
   * Fetch the summary strictly from customer_investment_summary table
   * for the customer's active GUARANTEED_RETURNS service.
   */
  async getCustomerSummaryForCustomer(customerId: string) {
    // Resolve active guaranteed returns service for this customer
    const service = await this.serviceRepo.findOne({
      where: {
        customer_id: customerId,
        service_type: CustomerServiceType.GUARANTEED_RETURNS,
        active: true,
      },
    });

    if (!service) {
      throw new NotFoundException(
        'Active guaranteed returns service not found',
      );
    }

    // Return the persisted summary row (no recalculation)
    const summary = await this.summaryRepo.findOne({
      where: { customer_id: customerId, service_id: service.id },
      //   relations: ['customer', 'service'],
    });

    if (!summary) {
      // If no row exists yet, return null to indicate no summary persisted
      return null;
    }

    return summary;
  }

  async getCustomerInvestments(customerId: string) {
    return this.transactionRepo.find({
      where: {
        customer_id: customerId,
        transaction_type: TransactionType.INVESTMENT_APPROVED,
      },
      relations: ['request'],
      order: { created_at: 'DESC' },
    });
  }

  async getCustomerTransactions(customerId: string) {
    return this.transactionRepo.find({
      where: { customer_id: customerId },
      relations: ['request'],
      order: { created_at: 'DESC' },
    });
  }

  // === Paginated variants ===
  private clampPagination(page?: number, limit?: number) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (p - 1) * l;
    return { page: p, limit: l, skip };
  }

  async listPendingRequestsPaginated(
    page?: number,
    limit?: number,
    startDate?: Date,
    endDate?: Date,
  ) {
    const { page: p, limit: l, skip } = this.clampPagination(page, limit);
    const where: FindOptionsWhere<InvestmentRequest> = {
      status: InvestmentRequestStatus.PENDING,
    };
    if (startDate && endDate) {
      where.created_at = Between(startDate, endDate);
    } else if (startDate) {
      where.created_at = MoreThanOrEqual(startDate);
    } else if (endDate) {
      where.created_at = LessThanOrEqual(endDate);
    }
    const [data, total] = await this.requestRepo.findAndCount({
      where,
      relations: ['customer'],
      order: { created_at: 'DESC' },
      skip,
      take: l,
    });
    return {
      data,
      total,
      page: p,
      limit: l,
      totalPages: Math.max(1, Math.ceil(total / l)),
    };
  }

  async findInvestmentRequestById(id: string): Promise<InvestmentRequest> {
    const request = await this.requestRepo.findOne({
      where: { id },
      relations: ['customer', 'service'],
    });
    if (!request) {
      throw new NotFoundException('Investment request not found');
    }
    return request;
  }

  async listPendingReturnsPaginated(
    page?: number,
    limit?: number,
    startDate?: Date,
    endDate?: Date,
  ) {
    const { page: p, limit: l, skip } = this.clampPagination(page, limit);
    const where: FindOptionsWhere<InvestmentTransaction> = {
      transaction_type: TransactionType.RETURN_REQUEST,
      return_request_status: ReturnRequestStatus.PENDING,
    };
    if (startDate && endDate) {
      where.created_at = Between(startDate, endDate);
    } else if (startDate) {
      where.created_at = MoreThanOrEqual(startDate);
    } else if (endDate) {
      where.created_at = LessThanOrEqual(endDate);
    }
    const [data, total] = await this.transactionRepo.findAndCount({
      where,
      relations: ['customer', 'request'],
      order: { created_at: 'DESC' },
      skip,
      take: l,
    });
    return {
      data,
      total,
      page: p,
      limit: l,
      totalPages: Math.max(1, Math.ceil(total / l)),
    };
  }

  async getCustomerTransactionsPaginated(
    customerId: string,
    page?: number,
    limit?: number,
    startDate?: Date,
    endDate?: Date,
  ) {
    const { page: p, limit: l, skip } = this.clampPagination(page, limit);
    const where: FindOptionsWhere<InvestmentTransaction> = {
      customer_id: customerId,
    };
    if (startDate && endDate) {
      where.created_at = Between(startDate, endDate);
    } else if (startDate) {
      where.created_at = MoreThanOrEqual(startDate);
    } else if (endDate) {
      where.created_at = LessThanOrEqual(endDate);
    }
    const [data, total] = await this.transactionRepo.findAndCount({
      where,
      relations: ['request'],
      order: { created_at: 'DESC' },
      skip,
      take: l,
    });
    return {
      data,
      total,
      page: p,
      limit: l,
      totalPages: Math.max(1, Math.ceil(total / l)),
    };
  }

  /**
   * View-model for customer transactions used by GET my-transactions.
   * Formats fields and computes duration, maturity, profit, and status.
   */
  async getCustomerTransactionsViewPaginated(
    customerId: string,
    page?: number,
    limit?: number,
    startDate?: Date,
    endDate?: Date,
  ) {
    const {
      data,
      total,
      page: p,
      limit: l,
      totalPages,
    } = await this.getCustomerTransactionsPaginated(
      customerId,
      page,
      limit,
      startDate,
      endDate,
    );

    // Helpers
    const fmtCurrency = (n: number | null | undefined) =>
      n == null || Number.isNaN(n)
        ? '—'
        : new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(n);
    const fmtDate = (d: Date | null | undefined) =>
      !d
        ? '—'
        : new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }).format(d);
    const fmtPercent = (r: number | null | undefined) =>
      r == null || Number.isNaN(r) ? '—' : `${(r * 100).toFixed(1)}%`;
    const addMonths = (date: Date, months: number) => {
      const d = new Date(date.getTime());
      const day = d.getDate();
      d.setMonth(d.getMonth() + months);
      if (d.getDate() < day) d.setDate(0);
      return d;
    };
    const humanizeMonths = (months?: number | null) => {
      if (!months || months <= 0) return '—';
      const years = Math.floor(months / 12);
      const rem = months % 12;
      const parts: string[] = [];
      if (years > 0) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
      if (rem > 0) parts.push(`${rem} ${rem === 1 ? 'month' : 'months'}`);
      return parts.length ? parts.join(' ') : `${months} months`;
    };

    const view = data.map((tx) => {
      const id = tx.id;
      const effDate = tx.effective_date ? new Date(tx.effective_date) : null;

      if (tx.transaction_type === TransactionType.INVESTMENT_APPROVED) {
        const principal = Number(tx.investment_principal ?? tx.amount ?? 0);
        const investDate = tx.investment_start_date
          ? new Date(tx.investment_start_date)
          : effDate;
        const termMonths = tx.term_months ?? null;
        const maturity =
          investDate && termMonths ? addMonths(investDate, termMonths) : null;
        const rate = tx.interest_rate != null ? Number(tx.interest_rate) : null;
        const profit =
          rate != null && termMonths != null
            ? principal * rate * (termMonths / 12)
            : rate != null && termMonths == null
              ? principal * rate
              : null;

        let status = 'Active';
        if (
          (tx.current_principal && Number(tx.current_principal) <= 0) ||
          (maturity && maturity <= new Date())
        ) {
          status = 'Completed';
        }

        return {
          id,
          amountInvested: fmtCurrency(principal),
          investDate: fmtDate(investDate),
          duration: humanizeMonths(termMonths),
          maturityDate: fmtDate(maturity),
          totalProfit: fmtCurrency(profit),
          status,
          returnRate: fmtPercent(rate ?? undefined),
        };
      }

      const amount = Number(tx.amount ?? 0);
      const statusMap: Record<string, string> = {
        [TransactionType.RETURN_REQUEST]:
          tx.return_request_status === ReturnRequestStatus.PAID
            ? 'Paid'
            : tx.return_request_status === ReturnRequestStatus.APPROVED
              ? 'Approved'
              : tx.return_request_status === ReturnRequestStatus.REJECTED
                ? 'Rejected'
                : 'Pending',
        [TransactionType.RETURN_APPROVED]: 'Approved',
        [TransactionType.RETURN_PAID]: 'Paid',
        [TransactionType.INTEREST_PAID]: 'Interest Paid',
        [TransactionType.PRINCIPAL_RETURNED]: 'Principal Returned',
        [TransactionType.ADJUSTMENT]: 'Adjustment',
        [TransactionType.INTEREST_CALCULATED]: 'Interest Accrued',
      } as Record<string, string>;
      const derivedStatus = statusMap[tx.transaction_type] || 'Recorded';

      return {
        id,
        amountInvested: fmtCurrency(amount),
        investDate: fmtDate(effDate),
        duration: '—',
        maturityDate: '—',
        totalProfit: '—',
        status: derivedStatus,
        returnRate: '—',
      };
    });

    return { data: view, total, page: p, limit: l, totalPages };
  }

  /**
   * Parse risk tolerance from string to enum
   */
  private parseRiskTolerance(riskToleranceStr?: string): RiskTolerance {
    if (!riskToleranceStr) {
      return RiskTolerance.MEDIUM; // Default to medium risk
    }

    const normalized = riskToleranceStr.toLowerCase().trim();
    switch (normalized) {
      case 'low':
      case 'conservative':
      case 'safe':
        return RiskTolerance.LOW;
      case 'medium':
      case 'moderate':
      case 'balanced':
        return RiskTolerance.MEDIUM;
      case 'high':
      case 'aggressive':
      case 'growth':
        return RiskTolerance.HIGH;
      default:
        return RiskTolerance.MEDIUM; // Default fallback
    }
  }

  async getInvestmentStats(): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  }> {
    const [total, pending, approved, rejected] = await Promise.all([
      this.requestRepo.count(),
      this.requestRepo.count({
        where: { status: InvestmentRequestStatus.PENDING },
      }),
      this.requestRepo.count({
        where: { status: InvestmentRequestStatus.APPROVED },
      }),
      this.requestRepo.count({
        where: { status: InvestmentRequestStatus.REJECTED },
      }),
    ]);

    return {
      total,
      pending,
      approved,
      rejected,
    };
  }
}
