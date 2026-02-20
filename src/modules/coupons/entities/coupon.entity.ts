import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import type { CouponUsage } from './coupon-usage.entity';
import { CustomerServiceType } from '../../customers/entities/customer-service.entity';
import { SubscriptionPackage } from '../../subscription-packages/entities/subscription-package.entity';

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

    @Column({ type: 'text', nullable: true })
    description: string | null;

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

    @Column({ type: 'uuid', nullable: true, comment: 'ID of the subscription package this coupon grants' })
    subscription_package_id: string | null;

    @ManyToOne(() => SubscriptionPackage, { eager: true, nullable: true })
    @JoinColumn({ name: 'subscription_package_id' })
    subscription_package: SubscriptionPackage;

    @OneToMany('CouponUsage', (usage: CouponUsage) => usage.coupon)
    usages: CouponUsage[];

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
