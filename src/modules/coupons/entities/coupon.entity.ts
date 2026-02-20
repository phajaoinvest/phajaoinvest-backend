import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    Index,
} from 'typeorm';
import type { CouponUsage } from './coupon-usage.entity';
import { CustomerServiceType } from '../../customers/entities/customer-service.entity';

export enum CouponDiscountType {
    PERCENTAGE = 'percentage',
    FIXED = 'fixed',
}

@Entity('coupons')
export class Coupon {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    @Index('idx_coupon_code')
    code: string;

    @Column({
        type: 'enum',
        enum: CouponDiscountType,
        default: CouponDiscountType.PERCENTAGE,
    })
    discount_type: CouponDiscountType;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    discount_value: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    min_purchase_amount: number | null;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    max_discount_amount: number | null;

    @Column({ type: 'timestamp', nullable: true })
    valid_from: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    valid_until: Date | null;

    @Column({ type: 'int', nullable: true, comment: 'Total times this coupon can be used' })
    usage_limit: number | null;

    @Column({ type: 'int', default: 0 })
    usage_count: number;

    @Column({ type: 'boolean', default: true })
    active: boolean;

    @Column({ type: 'int', nullable: true, comment: 'Number of months this coupon grants (for subscription services)' })
    duration_months: number | null;

    @Column({
        type: 'enum',
        enum: CustomerServiceType,
        array: true,
        default: [CustomerServiceType.PREMIUM_MEMBERSHIP],
    })
    applicable_services: CustomerServiceType[];

    @OneToMany('CouponUsage', (usage: CouponUsage) => usage.coupon)
    usages: CouponUsage[];

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
