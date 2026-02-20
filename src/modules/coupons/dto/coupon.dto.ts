import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    IsBoolean,
    Min,
    IsArray,
    IsDateString,
    IsUUID,
} from 'class-validator';
import { CouponDiscountType } from '../entities/coupon.entity';
import { CustomerServiceType } from '../../customers/entities/customer-service.entity';
import { Type } from 'class-transformer';

export class CreateCouponDto {
    @ApiProperty({ description: 'Coupon code', example: 'PROMO20' })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Discount type',
        enum: CouponDiscountType,
        example: CouponDiscountType.PERCENTAGE,
    })
    @IsEnum(CouponDiscountType)
    discount_type: CouponDiscountType;

    @ApiProperty({ description: 'Discount value (percentage or fixed)', example: 20 })
    @IsNumber()
    @Min(0)
    discount_value: number;

    @ApiPropertyOptional({ description: 'Minimum purchase amount', example: 100 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    min_purchase_amount?: number;

    @ApiPropertyOptional({ description: 'Maximum discount amount (for percentage type)', example: 50 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    max_discount_amount?: number;

    @ApiPropertyOptional({ description: 'Valid from date' })
    @IsOptional()
    @IsDateString()
    valid_from?: string;

    @ApiPropertyOptional({ description: 'Valid until date' })
    @IsOptional()
    @IsDateString()
    valid_until?: string;

    @ApiPropertyOptional({ description: 'Total usage limit', example: 100 })
    @IsOptional()
    @IsNumber()
    @Min(1)
    usage_limit?: number;

    @ApiPropertyOptional({ description: 'Number of months this coupon grants', example: 1 })
    @IsOptional()
    @IsNumber()
    @Min(1)
    duration_months?: number;

    @ApiPropertyOptional({ description: 'Is coupon active', default: true })
    @IsOptional()
    @IsBoolean()
    active?: boolean;

    @ApiPropertyOptional({
        description: 'Applicable services',
        enum: CustomerServiceType,
        isArray: true,
        example: [CustomerServiceType.PREMIUM_MEMBERSHIP],
    })
    @IsOptional()
    @IsArray()
    @IsEnum(CustomerServiceType, { each: true })
    applicable_services?: CustomerServiceType[];
}

export class UpdateCouponDto extends PartialType(CreateCouponDto) { }
export class ValidateCouponDto {
    @ApiProperty({ description: 'Coupon code', example: 'PROMO20' })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Service type',
        enum: CustomerServiceType,
        example: CustomerServiceType.PREMIUM_MEMBERSHIP,
    })
    @IsEnum(CustomerServiceType)
    service_type: CustomerServiceType;

    @ApiProperty({ description: 'Purchase amount before discount', example: 299.99 })
    @IsNumber()
    amount: number;
}

export class CouponResponseDto {
    id: string;
    code: string;
    discount_type: CouponDiscountType;
    discount_value: number;
    min_purchase_amount: number | null;
    max_discount_amount: number | null;
    valid_from: Date | null;
    valid_until: Date | null;
    usage_limit: number | null;
    usage_count: number;
    duration_months: number | null;
    active: boolean;
    applicable_services: CustomerServiceType[];
    created_at: Date;
    updated_at: Date;
}

export class CalculatedDiscountDto {
    @ApiProperty({ description: 'Original amount' })
    original_amount: number;

    @ApiProperty({ description: 'Discount amount' })
    discount_amount: number;

    @ApiProperty({ description: 'Final amount after discount' })
    final_amount: number;

    @ApiProperty({ description: 'Coupon code used' })
    code: string;
}
