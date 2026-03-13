import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan, Not } from 'typeorm';
import { StockPick } from '../entities/stock-pick.entity';
import {
  CustomerStockPick,
  CustomerPickStatus,
} from '../entities/customer-stock-pick.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { CustomerService } from '../../customers/entities/customer-service.entity';
import {
  CreateStockPickDto,
  UpdateStockPickDto,
  StockPickFilterDto,
  CustomerSubmitPaymentSlipDto,
  AdminApprovePickDto,
  StockPickResponseDto,
  CustomerStockPickResponseDto,
  CustomerViewStockPickDto,
  CustomerMySelectionItemDto,
} from '../dto/stock-picks.dto';
import {
  PaginationUtil,
  PaginatedResult,
} from '../../../common/utils/pagination.util';
import { NodemailerEmailService } from './email.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  buildStockPickPaymentNotification,
  buildStockPickApprovalNotification,
} from '../../notifications/utils/notification-builders';

export interface StockPickEmailData {
  to: string;
  customerName: string;
  stockSymbol: string;
  description: string;
  adminResponse: string;
  targetPrice?: number;
  currentPrice?: number;
}

// Status label mapping
const STATUS_LABELS: Record<CustomerPickStatus, string> = {
  [CustomerPickStatus.SELECTED]: 'Selected',
  [CustomerPickStatus.PAYMENT_SUBMITTED]: 'Payment Submitted',
  [CustomerPickStatus.APPROVED]: 'Approved',
  [CustomerPickStatus.REJECTED]: 'Rejected',
  [CustomerPickStatus.EMAIL_SENT]: 'Email Sent',
};

// Recommendation title case mapping
const RECOMMENDATION_MAP: Record<string, string> = {
  buy: 'Buy',
  hold: 'Hold',
  strong_buy: 'Strong Buy',
  sell: 'Sell',
};

@Injectable()
export class StockPicksService {
  constructor(
    @InjectRepository(StockPick)
    private readonly stockPickRepo: Repository<StockPick>,
    @InjectRepository(CustomerStockPick)
    private readonly customerPickRepo: Repository<CustomerStockPick>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(CustomerService)
    private readonly customerServiceRepo: Repository<CustomerService>,
    private readonly dataSource: DataSource,
    private readonly emailService: NodemailerEmailService,
    private readonly notificationsService: NotificationsService,
  ) { }

  // ============== Helper Methods ==============

  private toNumber(value: unknown): number | undefined {
    if (value === null || value === undefined) return undefined;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  private formatMoney(val?: number): string | undefined {
    return typeof val === 'number' && Number.isFinite(val)
      ? `$${val.toFixed(2)}`
      : undefined;
  }

  private formatPercent(val?: number): string | undefined {
    return typeof val === 'number'
      ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
      : undefined;
  }

  private formatDate(d?: Date | null): string | undefined {
    if (!d) return undefined;
    try {
      return new Date(d).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return undefined;
    }
  }

  private toTitleCase(str?: string | null): string {
    if (!str) return 'N/A';
    return str
      .split('_')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');
  }

  private parseDateParam(val?: string, endOfDay = false): Date | undefined {
    if (!val) return undefined;
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(val);
    const d = new Date(val);
    if (isNaN(d.getTime())) return undefined;
    if (isDateOnly) {
      if (endOfDay) {
        d.setHours(23, 59, 59, 999);
      } else {
        d.setHours(0, 0, 0, 0);
      }
    }
    return d;
  }

  private getCustomerFullName(customer: Customer): string {
    return `${customer.first_name} ${customer.last_name || ''}`.trim();
  }

  // ============== Admin Methods ==============

  async createStockPick(
    createDto: CreateStockPickDto,
    adminUserId: string,
  ): Promise<StockPickResponseDto> {
    const stockPick = this.stockPickRepo.create({
      ...createDto,
      created_by_admin_id: adminUserId,
      expires_at: createDto.expires_at ? new Date(createDto.expires_at) : null,
    });
    const saved = await this.stockPickRepo.save(stockPick);
    return this.mapToResponseDto(saved);
  }

  async getAllStockPicks(
    filterDto: StockPickFilterDto,
  ): Promise<PaginatedResult<StockPickResponseDto>> {
    const { page, limit, skip } = PaginationUtil.calculatePagination({
      page: filterDto.page,
      limit: filterDto.limit,
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.stockPickRepo.createQueryBuilder('pick');

    // Apply filters using object mapping for cleaner code
    const filters: Array<{
      condition: boolean;
      clause: string;
      params: Record<string, unknown>;
    }> = [
        {
          condition: !!filterDto.service_type,
          clause: 'pick.service_type = :serviceType',
          params: { serviceType: filterDto.service_type },
        },
        {
          condition: !!filterDto.status,
          clause: 'pick.status = :status',
          params: { status: filterDto.status },
        },
        {
          condition: !!filterDto.availability,
          clause: 'pick.availability = :availability',
          params: { availability: filterDto.availability },
        },
        {
          condition: filterDto.is_active !== undefined,
          clause: 'pick.is_active = :isActive',
          params: { isActive: filterDto.is_active },
        },
      ];

    filters
      .filter((f) => f.condition)
      .forEach((f) => qb.andWhere(f.clause, f.params));

    qb.orderBy('pick.created_at', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const mappedData = data.map((pick) => this.mapToResponseDto(pick));

    return PaginationUtil.createPaginatedResult(mappedData, total, {
      page,
      limit,
    });
  }

  async updateStockPick(
    pickId: string,
    updateDto: UpdateStockPickDto,
  ): Promise<StockPickResponseDto> {
    const existingPick = await this.stockPickRepo.findOne({
      where: { id: pickId },
    });

    if (!existingPick) {
      throw new NotFoundException('Stock pick not found');
    }

    await this.stockPickRepo.update(pickId, {
      ...updateDto,
      expires_at: updateDto.expires_at
        ? new Date(updateDto.expires_at)
        : existingPick.expires_at,
    });

    const updatedPick = await this.stockPickRepo.findOne({
      where: { id: pickId },
    });

    return this.mapToResponseDto(updatedPick!);
  }

  async deleteStockPick(pickId: string): Promise<void> {
    const result = await this.stockPickRepo.delete(pickId);
    if (result.affected === 0) {
      throw new NotFoundException('Stock pick not found');
    }
  }

  // ============== Customer Methods ==============

  async getAvailablePicksForCustomer(
    customerId: string | null,
    filterDto: StockPickFilterDto,
  ): Promise<PaginatedResult<CustomerViewStockPickDto>> {
    const { page, limit, skip } = PaginationUtil.calculatePagination({
      page: filterDto.page,
      limit: filterDto.limit,
      defaultLimit: 10,
      maxLimit: 50,
    });

    const qb = this.stockPickRepo.createQueryBuilder('pick');

    // Base filters
    if (filterDto.availability) {
      qb.andWhere('pick.availability = :availability', {
        availability: filterDto.availability,
      });
    }
    if (filterDto.is_active !== undefined) {
      qb.andWhere('pick.is_active = :isActive', {
        isActive: filterDto.is_active,
      });
    }

    // Exclude expired picks
    qb.andWhere('(pick.expires_at IS NULL OR pick.expires_at > :now)', {
      now: new Date(),
    });

    // Optional filters
    if (filterDto.risk_level) {
      qb.andWhere('pick.risk_level = :riskLevel', {
        riskLevel: filterDto.risk_level,
      });
    }
    if (filterDto.sector) {
      qb.andWhere('pick.sector ILIKE :sector', {
        sector: `%${filterDto.sector}%`,
      });
    }

    // Date range filter
    const startDate = this.parseDateParam(filterDto.start_date);
    const endDate = this.parseDateParam(filterDto.end_date, true);

    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('start_date cannot be after end_date');
    }
    if (startDate) {
      qb.andWhere('pick.created_at >= :startDate', { startDate });
    }
    if (endDate) {
      qb.andWhere('pick.created_at <= :endDate', { endDate });
    }

    // Expected return percent overlap filter
    if (
      filterDto.min_expected_return_percent !== undefined ||
      filterDto.max_expected_return_percent !== undefined
    ) {
      const minPct =
        filterDto.min_expected_return_percent ?? Number.NEGATIVE_INFINITY;
      const maxPct =
        filterDto.max_expected_return_percent ?? Number.POSITIVE_INFINITY;
      qb.andWhere(
        '((pick.expected_return_min_percent IS NULL AND pick.expected_return_max_percent IS NULL) OR (pick.expected_return_min_percent <= :maxPct AND pick.expected_return_max_percent >= :minPct))',
        { minPct, maxPct },
      );
    }

    // Time horizon overlap filter
    if (
      filterDto.min_time_horizon_months !== undefined ||
      filterDto.max_time_horizon_months !== undefined
    ) {
      const minMonths =
        filterDto.min_time_horizon_months ?? Number.NEGATIVE_INFINITY;
      const maxMonths =
        filterDto.max_time_horizon_months ?? Number.POSITIVE_INFINITY;
      qb.andWhere(
        '((pick.time_horizon_min_months IS NULL AND pick.time_horizon_max_months IS NULL) OR (pick.time_horizon_min_months <= :maxMonths AND pick.time_horizon_max_months >= :minMonths))',
        { minMonths, maxMonths },
      );
    }

    qb.orderBy('pick.created_at', 'DESC').skip(skip).take(limit);

    // Execute queries in parallel
    const [queryResult, customerSelections] = await Promise.all([
      qb.getManyAndCount(),
      customerId
        ? this.customerPickRepo.find({
          where: { customer_id: customerId },
          select: ['stock_pick_id', 'status'],
        })
        : Promise.resolve([]),
    ]);

    const [data, total] = queryResult;

    // Build selected set (exclude rejected)
    const selectedSet = new Set(
      customerSelections
        .filter((s) => s.status !== CustomerPickStatus.REJECTED)
        .map((s) => s.stock_pick_id),
    );

    const mappedData = data.map((pick) =>
      this.mapToCustomerViewDto(pick, selectedSet.has(pick.id)),
    );

    return PaginationUtil.createPaginatedResult(mappedData, total, {
      page,
      limit,
    });
  }

  async getCustomerSelections(
    customerId: string,
    page = 1,
    limit = 10,
  ): Promise<PaginatedResult<CustomerStockPickResponseDto>> {
    const {
      page: validPage,
      limit: validLimit,
      skip,
    } = PaginationUtil.calculatePagination({
      page,
      limit,
      defaultLimit: 10,
      maxLimit: 50,
    });

    const [data, total] = await this.customerPickRepo.findAndCount({
      where: { customer_id: customerId },
      order: { selected_at: 'DESC' },
      skip,
      take: validLimit,
      relations: ['stock_pick'],
    });

    const mappedData = data.map((pick) =>
      this.mapToCustomerPickResponseDto(pick),
    );

    return PaginationUtil.createPaginatedResult(mappedData, total, {
      page: validPage,
      limit: validLimit,
    });
  }

  async getCustomerSelectionsCards(
    customerId: string,
    page = 1,
    limit = 10,
    startDate?: Date,
    endDate?: Date,
  ): Promise<PaginatedResult<CustomerMySelectionItemDto>> {
    const {
      page: validPage,
      limit: validLimit,
      skip,
    } = PaginationUtil.calculatePagination({
      page,
      limit,
      defaultLimit: 10,
      maxLimit: 50,
    });

    const qb = this.customerPickRepo
      .createQueryBuilder('cp')
      .leftJoinAndSelect('cp.stock_pick', 'sp')
      .where('cp.customer_id = :cid', { cid: customerId });

    if (startDate || endDate) {
      if (startDate) qb.andWhere('cp.approved_at >= :startDate', { startDate });
      if (endDate) qb.andWhere('cp.approved_at <= :endDate', { endDate });
      qb.orderBy('cp.approved_at', 'DESC');
    } else {
      qb.orderBy('cp.selected_at', 'DESC');
    }

    qb.skip(skip).take(validLimit);

    const [data, total] = await qb.getManyAndCount();
    const mappedData = data.map((pick) =>
      this.mapToCustomerMySelectionItem(pick),
    );

    return PaginationUtil.createPaginatedResult(mappedData, total, {
      page: validPage,
      limit: validLimit,
    });
  }

  // ============== Payment Methods ==============

  async submitPaymentSlip(
    customerId: string,
    stockPickId: string,
    paymentSlipDto: CustomerSubmitPaymentSlipDto,
  ): Promise<CustomerStockPickResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const stockPickRepo = manager.getRepository(StockPick);
      const customerPickRepo = manager.getRepository(CustomerStockPick);

      // Validate stock pick
      const stockPick = await stockPickRepo.findOne({
        where: {
          id: stockPickId,
          is_active: true,
          expires_at: MoreThan(new Date()),
        },
      });

      if (!stockPick) {
        throw new NotFoundException('Stock pick not found');
      }
      if (!stockPick.is_active) {
        throw new BadRequestException('Stock pick is not active');
      }
      if (stockPick.expires_at && stockPick.expires_at <= new Date()) {
        throw new BadRequestException('Stock pick has expired');
      }

      // Check for existing submission
      const existing = await customerPickRepo.findOne({
        where: {
          customer_id: customerId,
          stock_pick_id: stockPickId,
          status: Not(CustomerPickStatus.REJECTED),
        },
      });

      if (existing) {
        throw new BadRequestException(
          'You already submitted for this stock pick',
        );
      }

      // Create customer pick
      const currentPrice = this.toNumber(stockPick.current_price);
      const pickEntity = customerPickRepo.create({
        customer_id: customerId,
        stock_pick_id: stockPickId,
        status: CustomerPickStatus.PAYMENT_SUBMITTED,
        payment_slip_url: paymentSlipDto.payment_slip_url,
        payment_slip_filename: paymentSlipDto.payment_slip_filename,
        payment_amount: paymentSlipDto.payment_amount,
        payment_reference: paymentSlipDto.payment_reference || null,
        customer_notes: paymentSlipDto.payment_notes || null,
        payment_submitted_at: new Date(),
        selected_price: currentPrice ?? null,
        selected_at: new Date(),
      });

      const saved = await customerPickRepo.save(pickEntity);
      const full = await customerPickRepo.findOne({
        where: { id: saved.id },
        relations: ['stock_pick'],
      });

      const result = this.mapToCustomerPickResponseDto(full!);

      // Notify admins about new stock pick submission
      this.customerRepo.findOne({ where: { id: customerId } }).then((customer) => {
        if (customer) {
          void this.notificationsService.createNotification(
            buildStockPickPaymentNotification(
              {
                customerId: customer.id,
                customerName: customer.username,
                customerEmail: customer.email,
              },
              saved.id,
              stockPick.stock_symbol,
              paymentSlipDto.payment_amount,
            ),
          );
        }
      });

      return result;
    });
  }

  // ============== Admin Approval Methods ==============

  async getPendingApprovals(
    page = 1,
    limit = 20,
    status?: string,
  ): Promise<
    PaginatedResult<
      CustomerStockPickResponseDto & {
        customer_email: string;
        customer_name: string;
        stock_symbol: string;
      }
    >
  > {
    const {
      page: validPage,
      limit: validLimit,
      skip,
    } = PaginationUtil.calculatePagination({
      page,
      limit,
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.customerPickRepo
      .createQueryBuilder('cp')
      .leftJoinAndSelect('cp.stock_pick', 'sp')
      .leftJoinAndSelect('cp.customer', 'c');

    if (status) {
      qb.where('cp.status = :status', { status });
    }

    qb.orderBy('cp.payment_submitted_at', 'ASC').skip(skip).take(validLimit);

    const [data, total] = await qb.getManyAndCount();
    const mappedData = data.map((pick) => this.mapToAdminPickDetail(pick));

    return PaginationUtil.createPaginatedResult(mappedData, total, {
      page: validPage,
      limit: validLimit,
    });
  }

  async getCustomerPickById(customerPickId: string) {
    const customerPick = await this.customerPickRepo.findOne({
      where: { id: customerPickId },
      relations: ['customer', 'stock_pick'],
    });

    if (!customerPick) {
      throw new NotFoundException('Customer pick not found');
    }

    return {
      ...this.mapToAdminPickDetail(customerPick),
      selected_price: this.toNumber(customerPick.selected_price) ?? null,
    };
  }

  async approveCustomerPick(
    customerPickId: string,
    adminUserId: string,
    approveDto: AdminApprovePickDto,
  ): Promise<CustomerStockPickResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const customerPickRepo = manager.getRepository(CustomerStockPick);

      const customerPick = await customerPickRepo.findOne({
        where: { id: customerPickId },
        relations: ['customer', 'stock_pick'],
      });

      if (!customerPick) {
        throw new NotFoundException('Customer pick not found');
      }

      if (customerPick.status !== CustomerPickStatus.PAYMENT_SUBMITTED) {
        throw new BadRequestException(
          'Customer pick can only be approved after payment submission',
        );
      }

      const newStatus =
        approveDto.approve !== false
          ? CustomerPickStatus.APPROVED
          : CustomerPickStatus.REJECTED;

      await customerPickRepo.update(customerPickId, {
        status: newStatus,
        admin_response: approveDto.admin_response,
        approved_by_admin_id: adminUserId,
        approved_at: new Date(),
      });

      const updatedPick = await customerPickRepo.findOne({
        where: { id: customerPickId },
        relations: ['customer', 'stock_pick'],
      });

      // Send email notification (non-blocking)
      this.sendStatusEmail(updatedPick!, newStatus).catch((err) =>
        console.error('Failed to send email:', err),
      );

      const result = this.mapToCustomerPickResponseDto(updatedPick!);

      // Notify customer about approval/rejection
      if (updatedPick) {
        if (newStatus === CustomerPickStatus.APPROVED) {
          void this.notificationsService.createNotification(
            buildStockPickApprovalNotification(
              {
                customerId: updatedPick.customer_id,
                customerName: updatedPick.customer.username,
                customerEmail: updatedPick.customer.email,
              },
              {
                adminId: adminUserId,
              },
              updatedPick.id,
              updatedPick.stock_pick.stock_symbol,
              true,
            ),
          );
        } else if (newStatus === CustomerPickStatus.REJECTED) {
          void this.notificationsService.createNotification(
            buildStockPickApprovalNotification(
              {
                customerId: updatedPick.customer_id,
                customerName: updatedPick.customer.username,
                customerEmail: updatedPick.customer.email,
              },
              {
                adminId: adminUserId,
              },
              updatedPick.id,
              updatedPick.stock_pick.stock_symbol,
              false,
              approveDto.admin_response,
            ),
          );
        }
      }

      return result;
    });
  }

  // ============== Email Methods ==============

  private async sendStatusEmail(
    customerPick: CustomerStockPick,
    status: CustomerPickStatus,
  ): Promise<void> {
    const customerName = this.getCustomerFullName(customerPick.customer);
    const stockPick = customerPick.stock_pick;

    if (status === CustomerPickStatus.APPROVED) {
      const emailHtml = `
        <h2>Your Stock Pick Has Been Approved!</h2>
        <p>Dear ${customerName},</p>
        <p>Great news! Your stock pick has been approved by our team.</p>
        <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <h3>Stock Details:</h3>
          <p><strong>Symbol:</strong> ${stockPick.stock_symbol}</p>
          <p><strong>Description:</strong> ${stockPick.description}</p>
          ${stockPick.sale_price ? `<p><strong>Sale Price:</strong> $${stockPick.sale_price}</p>` : ''}
          ${stockPick.target_price ? `<p><strong>Target Price:</strong> $${stockPick.target_price}</p>` : ''}
          ${stockPick.current_price ? `<p><strong>Current Price:</strong> $${stockPick.current_price}</p>` : ''}
        </div>
        <p><strong>Admin Message:</strong><br>${customerPick.admin_response || 'No additional message.'}</p>
        <p>Happy investing!<br>Your Trading Team</p>
      `;

      await this.emailService.sendEmail({
        to: customerPick.customer.email,
        subject: 'Your Stock Pick Has Been Approved',
        html: emailHtml,
        text: `Your stock pick ${stockPick.stock_symbol} has been approved. ${customerPick.admin_response || ''}`,
      });
    } else if (status === CustomerPickStatus.REJECTED) {
      const emailHtml = `
        <h2>Your Stock Pick Submission Was Not Approved</h2>
        <p>Dear ${customerName},</p>
        <p>We reviewed your stock pick submission and it was <strong>rejected</strong>.</p>
        <div style="background:#f8d7da;padding:15px;border-radius:5px;color:#842029;margin:20px 0;">
          <p style="margin:0;"><strong>Reason:</strong><br>${customerPick.admin_response || 'No reason provided.'}</p>
        </div>
        <p>You can review available stock picks and submit again if you wish.</p>
        <p>Regards,<br>Your Trading Team</p>
      `;

      await this.emailService.sendEmail({
        to: customerPick.customer.email,
        subject: 'Your Stock Pick Submission Was Not Approved',
        html: emailHtml,
        text: `Your stock pick submission was rejected. Reason: ${customerPick.admin_response || 'No reason provided.'}`,
      });
    }
  }

  // ============== Mapping Methods ==============

  private mapToResponseDto(stockPick: StockPick): StockPickResponseDto {
    return {
      id: stockPick.id,
      stock_symbol: stockPick.stock_symbol,
      company: stockPick.company ?? undefined,
      description: stockPick.description,
      status: stockPick.status,
      availability: stockPick.availability,
      service_type: stockPick.service_type,
      created_by_admin_id: stockPick.created_by_admin_id,
      admin_notes: stockPick.admin_notes ?? undefined,
      target_price: stockPick.target_price ?? undefined,
      current_price: stockPick.current_price ?? undefined,
      recommendation: stockPick.recommendation ?? undefined,
      sale_price: stockPick.sale_price,
      risk_level: stockPick.risk_level ?? undefined,
      expected_return_min_percent:
        stockPick.expected_return_min_percent ?? undefined,
      expected_return_max_percent:
        stockPick.expected_return_max_percent ?? undefined,
      time_horizon_min_months: stockPick.time_horizon_min_months ?? undefined,
      time_horizon_max_months: stockPick.time_horizon_max_months ?? undefined,
      sector: stockPick.sector ?? undefined,
      analyst_name: stockPick.analyst_name ?? undefined,
      tier_label: stockPick.tier_label ?? undefined,
      key_points: stockPick.key_points ?? undefined,
      email_delivery: stockPick.email_delivery ?? undefined,
      expires_at: stockPick.expires_at ?? undefined,
      is_active: stockPick.is_active,
      created_at: stockPick.created_at,
      updated_at: stockPick.updated_at,
    };
  }

  private mapToCustomerViewDto(
    stockPick: StockPick,
    isSelected = false,
  ): CustomerViewStockPickDto {
    return {
      id: stockPick.id,
      description: stockPick.description,
      status: stockPick.status,
      service_type: stockPick.service_type,
      target_price: stockPick.target_price ?? undefined,
      current_price: stockPick.current_price ?? undefined,
      sale_price: stockPick.sale_price,
      company: stockPick.company ?? undefined,
      recommendation: stockPick.recommendation ?? undefined,
      risk_level: stockPick.risk_level ?? undefined,
      expected_return_min_percent:
        stockPick.expected_return_min_percent ?? undefined,
      expected_return_max_percent:
        stockPick.expected_return_max_percent ?? undefined,
      time_horizon_min_months: stockPick.time_horizon_min_months ?? undefined,
      time_horizon_max_months: stockPick.time_horizon_max_months ?? undefined,
      sector: stockPick.sector ?? undefined,
      analyst_name: stockPick.analyst_name ?? undefined,
      tier_label: stockPick.tier_label ?? undefined,
      key_points: stockPick.key_points ?? undefined,
      email_delivery: stockPick.email_delivery ?? undefined,
      expires_at: stockPick.expires_at ?? undefined,
      created_at: stockPick.created_at,
      is_selected: isSelected,
    };
  }

  private mapToCustomerMySelectionItem(
    customerPick: CustomerStockPick,
  ): CustomerMySelectionItemDto {
    const sp = customerPick.stock_pick;
    const targetPrice =
      this.toNumber(customerPick.selected_price) ??
      this.toNumber(sp?.target_price);
    const currentPrice = this.toNumber(sp?.current_price);

    let changePercent: number | undefined;
    if (targetPrice && targetPrice > 0 && currentPrice !== undefined) {
      changePercent = ((currentPrice - targetPrice) / targetPrice) * 100;
    }

    return {
      id: customerPick.id,
      date:
        this.formatDate(customerPick.approved_at ?? customerPick.selected_at) ??
        '',
      stock:
        customerPick.status === CustomerPickStatus.APPROVED
          ? sp?.stock_symbol
          : undefined,
      company: customerPick.status === CustomerPickStatus.APPROVED ? (sp?.company || sp?.stock_symbol || 'N/A') : 'N/A',
      buyPrice: this.formatMoney(targetPrice),
      currentPrice: this.formatMoney(currentPrice),
      change: this.formatPercent(changePercent),
      isPositive: changePercent !== undefined ? changePercent >= 0 : undefined,
      status: STATUS_LABELS[customerPick.status] || 'Selected',
      recommendation: RECOMMENDATION_MAP[sp?.recommendation ?? ''] || 'N/A',
      risk_level: sp?.risk_level ? this.toTitleCase(sp.risk_level) : 'N/A',
    };
  }

  private mapToCustomerPickResponseDto(
    customerPick: CustomerStockPick,
  ): CustomerStockPickResponseDto {
    const baseResponse: CustomerStockPickResponseDto = {
      id: customerPick.id,
      customer_id: customerPick.customer_id,
      stock_pick_id: customerPick.stock_pick_id,
      status: customerPick.status,
      customer_notes: customerPick.customer_notes ?? undefined,
      admin_response: customerPick.admin_response ?? undefined,
      approved_by_admin_id: customerPick.approved_by_admin_id ?? undefined,
      approved_at: customerPick.approved_at ?? undefined,
      email_sent_at: customerPick.email_sent_at ?? undefined,
      payment_slip_url: customerPick.payment_slip_url ?? undefined,
      payment_slip_filename: customerPick.payment_slip_filename ?? undefined,
      payment_amount: customerPick.payment_amount ?? undefined,
      payment_reference: customerPick.payment_reference ?? undefined,
      payment_submitted_at: customerPick.payment_submitted_at ?? undefined,
      selected_at: customerPick.selected_at,
      updated_at: customerPick.updated_at,
    };

    // Include stock symbol only when approved
    if (
      customerPick.status === CustomerPickStatus.APPROVED &&
      customerPick.stock_pick
    ) {
      return {
        ...baseResponse,
        stock_symbol: customerPick.stock_pick.stock_symbol,
      };
    }

    return baseResponse;
  }

  private mapStockPickDetail(sp: StockPick) {
    return {
      id: sp.id,
      stock_symbol: sp.stock_symbol,
      company: sp.company,
      description: sp.description,
      service_type: sp.service_type,
      current_price: this.toNumber(sp.current_price) ?? null,
      target_price: this.toNumber(sp.target_price) ?? null,
      sale_price: this.toNumber(sp.sale_price) ?? 0,
      status: sp.status,
      availability: sp.availability,
      risk_level: sp.risk_level,
      recommendation: sp.recommendation,
      expected_return_min_percent:
        this.toNumber(sp.expected_return_min_percent) ?? null,
      expected_return_max_percent:
        this.toNumber(sp.expected_return_max_percent) ?? null,
      time_horizon_min_months: sp.time_horizon_min_months,
      time_horizon_max_months: sp.time_horizon_max_months,
      sector: sp.sector,
      analyst_name: sp.analyst_name,
      admin_notes: sp.admin_notes,
      created_at: sp.created_at,
    };
  }

  private mapToAdminPickDetail(pick: CustomerStockPick) {
    const baseDto = this.mapToCustomerPickResponseDto(pick);
    return {
      ...baseDto,
      customer_email: pick.customer.email,
      customer_name: this.getCustomerFullName(pick.customer),
      stock_symbol: pick.stock_pick.stock_symbol,
      customer: {
        id: pick.customer.id,
        first_name: pick.customer.first_name,
        last_name: pick.customer.last_name,
        email: pick.customer.email,
      },
      stock_pick: this.mapStockPickDetail(pick.stock_pick),
    };
  }

  // ============== Stats Methods ==============

  async getCustomerSummaryStats(customerId: string) {
    const picks = await this.customerPickRepo.find({
      where: { customer_id: customerId, status: CustomerPickStatus.APPROVED },
      relations: ['stock_pick'],
      order: { approved_at: 'DESC' },
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const totalApproved = picks.length;
    const thisMonthNew = picks.filter(
      (p) => p.approved_at && p.approved_at >= startOfMonth,
    ).length;

    let wins = 0;
    let considered = 0;
    let totalCurrent = 0;
    let totalInvested = 0;

    for (const p of picks) {
      const baseline =
        this.toNumber(p.selected_price) ??
        this.toNumber(p.stock_pick?.target_price);
      const current = this.toNumber(p.stock_pick?.current_price);

      if (baseline !== undefined && current !== undefined && baseline > 0) {
        considered++;
        if (current > baseline) wins++;
        totalCurrent += current;
        totalInvested += baseline;
      }
    }

    const winningRatePercent = considered > 0 ? (wins / considered) * 100 : 0;
    const totalReturn = totalCurrent - totalInvested;
    const overallReturnPercent =
      totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

    return {
      totals: {
        total_picks: totalApproved,
        this_month_new: thisMonthNew,
        winning_rate_percent: Number(winningRatePercent.toFixed(1)),
        wins,
        considered,
        total_current: Number(totalCurrent.toFixed(2)),
        total_invested: Number(totalInvested.toFixed(2)),
        total_return: Number(totalReturn.toFixed(2)),
        overall_return_percent: Number(overallReturnPercent.toFixed(1)),
        avg_return_percent_per_pick: Number(
          (considered > 0 ? overallReturnPercent / considered : 0).toFixed(1),
        ),
      },
    };
  }

  async getCustomerPicksStats(): Promise<{
    total: number;
    selected: number;
    payment_submitted: number;
    approved: number;
    rejected: number;
    email_sent: number;
  }> {
    const [total, selected, payment_submitted, approved, rejected, email_sent] =
      await Promise.all([
        this.customerPickRepo.count(),
        this.customerPickRepo.count({
          where: { status: CustomerPickStatus.SELECTED },
        }),
        this.customerPickRepo.count({
          where: { status: CustomerPickStatus.PAYMENT_SUBMITTED },
        }),
        this.customerPickRepo.count({
          where: { status: CustomerPickStatus.APPROVED },
        }),
        this.customerPickRepo.count({
          where: { status: CustomerPickStatus.REJECTED },
        }),
        this.customerPickRepo.count({
          where: { status: CustomerPickStatus.EMAIL_SENT },
        }),
      ]);

    return {
      total,
      selected,
      payment_submitted,
      approved,
      rejected,
      email_sent,
    };
  }
}
