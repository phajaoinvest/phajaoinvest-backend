import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon, CouponDiscountType } from './entities/coupon.entity';
import { CouponGroup } from './entities/coupon-group.entity';
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
        @InjectRepository(CouponGroup)
        private readonly groupRepo: Repository<CouponGroup>,
        @InjectRepository(CouponUsage)
        private readonly usageRepo: Repository<CouponUsage>,
    ) { }

    async create(dto: CreateCouponDto): Promise<CouponGroup> {
        if (dto.generate_count && dto.generate_count > 0) {
            return this.createBulk(dto);
        }

        if (!dto.code) {
            throw new BadRequestException('Coupon code is required for single creation');
        }

        const existing = await this.couponRepo.findOne({ where: { code: dto.code } });
        if (existing) {
            throw new BadRequestException('Coupon code already exists');
        }

        const group = this.groupRepo.create({
            name: dto.code,
            is_bulk: false,
            total_coupons: 1,
        });
        const savedGroup = await this.groupRepo.save(group);

        const coupon = this.couponRepo.create({
            ...dto,
            code: dto.code,
            group_id: savedGroup.id,
            valid_from: dto.valid_from ? new Date(dto.valid_from) : null,
            valid_until: dto.valid_until ? new Date(dto.valid_until) : null,
        });

        await this.couponRepo.save(coupon);
        return this.findGroup(savedGroup.id);
    }

    async createBulk(dto: CreateCouponDto): Promise<CouponGroup> {
        const count = dto.generate_count || 1;
        const prefix = dto.code_prefix || 'BULK';

        const group = this.groupRepo.create({
            name: `${prefix} Batch`,
            is_bulk: true,
            total_coupons: count,
        });
        const savedGroup = await this.groupRepo.save(group);

        const couponsToCreate: Coupon[] = [];
        for (let i = 0; i < count; i++) {
            const randomCode = `${prefix}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            couponsToCreate.push(this.couponRepo.create({
                ...dto,
                code: randomCode,
                group_id: savedGroup.id,
                valid_from: dto.valid_from ? new Date(dto.valid_from) : null,
                valid_until: dto.valid_until ? new Date(dto.valid_until) : null,
            }));
        }

        await this.couponRepo.save(couponsToCreate);
        return this.findGroup(savedGroup.id);
    }

    async findAllGroups(filter: CouponFilterDto): Promise<PaginatedResult<CouponGroup>> {
        const { page, limit, skip } = PaginationUtil.calculatePagination({
            page: filter.page,
            limit: filter.limit,
            defaultLimit: 10,
            maxLimit: 100,
        });

        const qb = this.groupRepo.createQueryBuilder('group');

        if (filter.search) {
            qb.andWhere(`(group.name ILIKE :search OR EXISTS (
                SELECT 1 FROM coupons c WHERE c.group_id = group.id AND (c.code ILIKE :search OR c.description ILIKE :search)
            ))`, { search: `%${filter.search}%` });
        }

        if (filter.active !== undefined) {
            qb.andWhere(`EXISTS (
                SELECT 1 FROM coupons c WHERE c.group_id = group.id AND c.active = :active
            )`, { active: filter.active });
        }

        const [groups, total] = await qb
            .orderBy(`group.created_at`, filter.order || 'DESC')
            .skip(skip)
            .take(limit)
            .getManyAndCount();

        // Fetch exactly 1 sample coupon for each group for the list display
        for (const group of groups) {
            const sampleCoupon = await this.couponRepo.findOne({
                where: { group_id: group.id },
                relations: ['subscription_package']
            });
            group.coupons = sampleCoupon ? [sampleCoupon] : [];

            if (group.is_bulk && sampleCoupon) {
                const { sum } = await this.couponRepo.createQueryBuilder('c')
                    .select('SUM(c.usage_count)', 'sum')
                    .where('c.group_id = :groupId', { groupId: group.id })
                    .getRawOne();
                sampleCoupon.usage_count = parseInt(sum || '0', 10);
            }
        }

        return PaginationUtil.createPaginatedResult(groups, total, { page, limit });
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
            qb.andWhere('(coupon.code ILIKE :search OR coupon.description ILIKE :search)', {
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

    async findByGroup(groupId: string): Promise<Coupon[]> {
        return this.couponRepo.find({
            where: { group_id: groupId },
            relations: ['subscription_package'],
            order: { created_at: 'DESC' }
        });
    }

    async findGroup(groupId: string): Promise<CouponGroup> {
        const group = await this.groupRepo.findOne({
            where: { id: groupId },
            relations: ['coupons', 'coupons.subscription_package']
        });
        if (!group) throw new NotFoundException('Group not found');
        return group;
    }

    async findOne(id: string): Promise<Coupon> {
        const coupon = await this.couponRepo.findOne({ where: { id } });
        if (!coupon) throw new NotFoundException('Coupon not found');
        return coupon;
    }

    async updateGroup(groupId: string, dto: UpdateCouponDto): Promise<CouponGroup> {
        const group = await this.findGroup(groupId);

        const updateData: any = {};

        if (dto.description !== undefined) updateData.description = dto.description;
        if (dto.discount_type !== undefined) updateData.discount_type = dto.discount_type;
        if (dto.discount_value !== undefined) updateData.discount_value = dto.discount_value;
        if (dto.max_discount_amount !== undefined) updateData.max_discount_amount = dto.max_discount_amount;
        if (dto.min_purchase_amount !== undefined) updateData.min_purchase_amount = dto.min_purchase_amount;
        if (dto.valid_from !== undefined) updateData.valid_from = dto.valid_from ? new Date(dto.valid_from) : null;
        if (dto.valid_until !== undefined) updateData.valid_until = dto.valid_until ? new Date(dto.valid_until) : null;
        if (dto.usage_limit !== undefined) updateData.usage_limit = dto.usage_limit;
        if (dto.subscription_package_id !== undefined) updateData.subscription_package_id = dto.subscription_package_id || null;
        if (dto.active !== undefined) updateData.active = dto.active;

        if (dto.code && !group.is_bulk) {
            const coupon = group.coupons[0];
            if (coupon && dto.code !== coupon.code) {
                const existing = await this.couponRepo.findOne({ where: { code: dto.code } });
                if (existing && existing.id !== coupon.id) throw new BadRequestException('Coupon code already exists');
                updateData.code = dto.code;
                await this.groupRepo.update({ id: groupId }, { name: dto.code });
            }
        }

        if (Object.keys(updateData).length > 0) {
            await this.couponRepo.update({ group_id: groupId }, updateData);
        }

        return this.findGroup(groupId);
    }

    async removeGroup(groupId: string): Promise<void> {
        await this.groupRepo.delete(groupId); // deletes cascade coupons
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
        await this.couponRepo.increment({ id: couponId }, 'usage_count', 1);

        return savedUsage;
    }

    async getCouponByCode(code: string): Promise<Coupon | null> {
        return this.couponRepo.findOne({ where: { code } });
    }
}
