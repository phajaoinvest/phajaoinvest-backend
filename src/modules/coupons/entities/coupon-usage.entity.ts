import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Coupon } from './coupon.entity';
import { Customer } from '../../customers/entities/customer.entity';

@Entity('coupon_usages')
export class CouponUsage {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    coupon_id: string;

    @ManyToOne(() => Coupon, (coupon) => coupon.usages)
    @JoinColumn({ name: 'coupon_id' })
    coupon: Coupon;

    @Column({ type: 'uuid' })
    customer_id: string;

    @ManyToOne(() => Customer)
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;

    @Column({ type: 'uuid', nullable: true, comment: 'ID of the service application/payment where coupon was used' })
    reference_id: string | null;

    @Column({ type: 'decimal', precision: 10, scale: 2, comment: 'Discount amount applied' })
    discount_applied: number;

    @CreateDateColumn()
    used_at: Date;
}
