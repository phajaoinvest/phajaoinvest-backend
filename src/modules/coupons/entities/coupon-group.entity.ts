import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
} from 'typeorm';
import { Coupon } from './coupon.entity';

@Entity('coupon_groups')
export class CouponGroup {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', comment: 'Name or prefix for this group generation' })
    name: string;

    @Column({ type: 'boolean', default: false })
    is_bulk: boolean;

    @Column({ type: 'int', default: 1 })
    total_coupons: number;

    @OneToMany(() => Coupon, (coupon) => coupon.group)
    coupons: Coupon[];

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
