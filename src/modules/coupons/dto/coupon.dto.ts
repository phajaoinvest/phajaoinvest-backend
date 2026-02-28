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
import { ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CreateCouponDto {
    @ApiProperty({ description: 'Coupon code', example: 'PROMO20' })
    @ValidateIf((o) => !o.generate_count)
    @IsString()
    code?: string;

    @ApiPropertyOptional({ description: 'Number of coupons to generate (bulk creation)' })
    @IsOptional()
    @IsNumber()
    @Min(1)
    generate_count?: number;

    @ApiPropertyOptional({ description: 'Prefix for generated coupon codes' })
    @IsOptional()
    @IsString()
    code_prefix?: string;

    @ApiPropertyOptional({ description: 'Description of the coupon' })
    @IsOptional()
    @IsString()
    description?: string;

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

    @ApiPropertyOptional({ description: 'ID of the subscription package this coupon grants' })
    @IsOptional()
    @IsUUID()
    subscription_package_id?: string;

    @ApiPropertyOptional({ description: 'Is coupon active', default: true })
    @IsOptional()
    @IsBoolean()
    active?: boolean;
}

export class UpdateCouponDto extends PartialType(CreateCouponDto) { }

export class CouponFilterDto extends PaginationQueryDto {
    @ApiPropertyOptional({ description: 'Search by coupon code or description' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ description: 'Filter by active status' })
    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    active?: boolean;
}

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
    description: string | null;
    discount_type: CouponDiscountType;
    discount_value: number;
    min_purchase_amount: number | null;
    max_discount_amount: number | null;
    valid_from: Date | null;
    valid_until: Date | null;
    usage_limit: number | null;
    usage_count: number;
    subscription_package_id: string | null;
    active: boolean;
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
