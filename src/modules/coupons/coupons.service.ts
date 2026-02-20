import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Coupon, CouponDiscountType } from './entities/coupon.entity';
import { CouponUsage } from './entities/coupon-usage.entity';
import {
    CreateCouponDto,
    UpdateCouponDto,
    ValidateCouponDto,
    CalculatedDiscountDto,
    CouponFilterDto,
} from './dto/coupon.dto';
import { CustomerServiceType } from '../customers/entities/customer-service.entity';
import { PaginationUtil, PaginatedResult } from '../../common/utils/pagination.util';

@Injectable()
export class CouponsService {
    constructor(
        @InjectRepository(Coupon)
        private readonly couponRepo: Repository<Coupon>,
        @InjectRepository(CouponUsage)
        private readonly usageRepo: Repository<CouponUsage>,
    ) { }

    async create(dto: CreateCouponDto): Promise<Coupon> {
        const existing = await this.couponRepo.findOne({ where: { code: dto.code } });
        if (existing) {
            throw new BadRequestException('Coupon code already exists');
        }

        const coupon = this.couponRepo.create({
            ...dto,
            valid_from: dto.valid_from ? new Date(dto.valid_from) : null,
            valid_until: dto.valid_until ? new Date(dto.valid_until) : null,
        });

        return this.couponRepo.save(coupon);
    }

    async findAll(filter: CouponFilterDto): Promise<PaginatedResult<Coupon>> {
        const { page, limit, skip } = PaginationUtil.calculatePagination({
            page: filter.page,
            limit: filter.limit,
            defaultLimit: 10,
            maxLimit: 100,
        });

        const qb = this.couponRepo.createQueryBuilder('coupon');

        if (filter.search) {
            qb.where('coupon.code ILIKE :search OR coupon.description ILIKE :search', {
                search: `%${filter.search}%`,
            });
        }

        if (filter.active !== undefined) {
            qb.andWhere('coupon.active = :active', { active: filter.active });
        }

        qb.leftJoinAndSelect('coupon.subscription_package', 'subscription_package');

        const [data, total] = await qb
            .orderBy(`coupon.${filter.sort || 'created_at'}`, filter.order || 'DESC')
            .skip(skip)
            .take(limit)
            .getManyAndCount();

        return PaginationUtil.createPaginatedResult(data, total, { page, limit });
    }

    async findOne(id: string): Promise<Coupon> {
        const coupon = await this.couponRepo.findOne({ where: { id } });
        if (!coupon) throw new NotFoundException('Coupon not found');
        return coupon;
    }

    async update(id: string, dto: UpdateCouponDto): Promise<Coupon> {
        const coupon = await this.findOne(id);

        if (dto.code && dto.code !== coupon.code) {
            const existing = await this.couponRepo.findOne({ where: { code: dto.code } });
            if (existing) throw new BadRequestException('Coupon code already exists');
        }

        Object.assign(coupon, {
            ...dto,
            valid_from: dto.valid_from ? new Date(dto.valid_from) : coupon.valid_from,
            valid_until: dto.valid_until ? new Date(dto.valid_until) : coupon.valid_until,
        });

        return this.couponRepo.save(coupon);
    }

    async remove(id: string): Promise<void> {
        const coupon = await this.findOne(id);
        await this.couponRepo.remove(coupon);
    }

    async validateCoupon(
        code: string,
        serviceType: CustomerServiceType,
        amount: number,
        customerId?: string,
    ): Promise<Coupon> {
        const coupon = await this.couponRepo.findOne({ where: { code, active: true } });

        if (!coupon) {
            throw new NotFoundException('Invalid or inactive coupon code');
        }

        const now = new Date();
        if (coupon.valid_from && coupon.valid_from > now) {
            throw new BadRequestException('Coupon is not yet valid');
        }
        if (coupon.valid_until && coupon.valid_until < now) {
            throw new BadRequestException('Coupon has expired');
        }

        if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) {
            throw new BadRequestException('Coupon usage limit reached');
        }

        if (serviceType !== CustomerServiceType.PREMIUM_MEMBERSHIP) {
            throw new BadRequestException(`Coupons currently only apply to ${CustomerServiceType.PREMIUM_MEMBERSHIP}`);
        }

        if (coupon.min_purchase_amount !== null && amount < Number(coupon.min_purchase_amount)) {
            throw new BadRequestException(
                `Minimum purchase amount of ${coupon.min_purchase_amount} required`,
            );
        }

        if (customerId) {
            const usedByCustomer = await this.usageRepo.findOne({
                where: { coupon_id: coupon.id, customer_id: customerId },
            });
            if (usedByCustomer) {
                throw new BadRequestException('You have already used this coupon');
            }
        }

        return coupon;
    }

    calculateDiscount(coupon: Coupon, amount: number): CalculatedDiscountDto {
        let discountAmount = 0;

        if (coupon.discount_type === CouponDiscountType.PERCENTAGE) {
            discountAmount = (amount * Number(coupon.discount_value)) / 100;
            if (coupon.max_discount_amount !== null && discountAmount > Number(coupon.max_discount_amount)) {
                discountAmount = Number(coupon.max_discount_amount);
            }
        } else {
            discountAmount = Number(coupon.discount_value);
        }

        // Ensure discount doesn't exceed original amount
        discountAmount = Math.min(discountAmount, amount);

        return {
            original_amount: amount,
            discount_amount: Number(discountAmount.toFixed(2)),
            final_amount: Number((amount - discountAmount).toFixed(2)),
            code: coupon.code,
        };
    }

    async recordUsage(
        couponId: string,
        customerId: string,
        discountApplied: number,
        referenceId?: string,
    ): Promise<CouponUsage> {
        const usage = this.usageRepo.create({
            coupon_id: couponId,
            customer_id: customerId,
            discount_applied: discountApplied,
            reference_id: referenceId,
        });

        const savedUsage = await this.usageRepo.save(usage);

        // Increment usage count on coupon
        await this.couponRepo.increment({ id: couponId }, 'usage_count', 1);

        return savedUsage;
    }

    async getCouponByCode(code: string): Promise<Coupon | null> {
        return this.couponRepo.findOne({ where: { code } });
    }
}
