import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CustomerServiceType,
  SubscriptionDuration,
} from '../entities/customer-service.entity';

export class SubscriptionPackageDto {
  @ApiProperty({
    description: 'Subscription duration in months',
    enum: SubscriptionDuration,
    example: SubscriptionDuration.THREE_MONTHS,
  })
  @IsEnum(SubscriptionDuration)
  duration: SubscriptionDuration;

  @ApiPropertyOptional({
    description: 'Subscription fee amount (will be calculated if not provided)',
    example: 99.99,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  fee?: number;
}

// Payment Slip DTO (moved here to be used in ApplyPremiumMembershipDto)
export class SubmitPaymentSlipDto {
  @ApiProperty({
    description: 'Payment slip file URL',
    example: 'https://storage.example.com/payment-slips/slip-123.jpg',
  })
  @IsString()
  payment_slip_url: string;

  @ApiProperty({
    description: 'Payment slip filename',
    example: 'payment-slip-premium-membership.jpg',
  })
  @IsString()
  payment_slip_filename: string;

  @ApiProperty({
    description: 'Payment amount',
    example: 299.99,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  payment_amount: number;

  @ApiPropertyOptional({
    description: 'Payment reference number',
    example: 'TXN-12345-2024',
  })
  @IsOptional()
  @IsString()
  payment_reference?: string;
}

export class ApplyPremiumMembershipDto {
  @ApiProperty({
    description: 'Service type - must be premium_membership',
    enum: CustomerServiceType,
    example: CustomerServiceType.PREMIUM_MEMBERSHIP,
  })
  @IsEnum(CustomerServiceType)
  service_type: CustomerServiceType.PREMIUM_MEMBERSHIP;
  @ApiProperty({
    description: 'Selected subscription package ID',
    example: 'uuid-package-id',
  })
  @IsString()
  package_id!: string;

  // Deprecated: keep for backward compatibility if older clients still send inline subscription
  @ApiPropertyOptional({
    description:
      '[Deprecated] Inline subscription object; prefer package_id instead',
    type: SubscriptionPackageDto,
  })
  @ValidateNested()
  @IsOptional()
  @Type(() => SubscriptionPackageDto)
  subscription?: SubscriptionPackageDto;

  @ApiPropertyOptional({
    description: 'Coupon code for discount',
    example: 'PROMO20',
  })
  @IsOptional()
  @IsString()
  coupon_code?: string;

  @ApiProperty({
    description: 'Payment slip information (required for application)',
    type: SubmitPaymentSlipDto,
  })
  @ValidateNested()
  @Type(() => SubmitPaymentSlipDto)
  payment_slip: SubmitPaymentSlipDto;
}

export class SubscriptionStatusDto {
  @ApiProperty({
    description: 'Service ID',
    example: 'uuid-here',
  })
  id: string;

  @ApiProperty({
    description: 'Customer ID',
    example: 'uuid-here',
  })
  customer_id: string;

  @ApiProperty({
    description: 'Service type',
    enum: CustomerServiceType,
    example: CustomerServiceType.PREMIUM_MEMBERSHIP,
  })
  service_type: CustomerServiceType;

  @ApiProperty({
    description: 'Whether service is currently active',
    example: true,
  })
  active: boolean;

  @ApiProperty({
    description: 'Subscription duration in months',
    enum: SubscriptionDuration,
    example: SubscriptionDuration.THREE_MONTHS,
  })
  subscription_duration: SubscriptionDuration;

  @ApiProperty({
    description: 'When the subscription expires',
    example: '2025-01-02T00:00:00.000Z',
  })
  subscription_expires_at: Date;

  @ApiProperty({
    description: 'Payment status',
    example: 'paid',
  })
  payment_status: string;

  @ApiProperty({
    description: 'Subscription fee amount',
    example: 99.99,
  })
  subscription_fee: number;

  @ApiProperty({
    description: 'When the service was applied for',
    example: '2024-10-02T00:00:00.000Z',
  })
  applied_at: Date;
}

export class RenewSubscriptionDto {
  @ApiProperty({
    description: 'Service ID to renew',
    example: 'uuid-here',
  })
  @IsUUID()
  service_id: string;

  @ApiProperty({
    description: 'New subscription package details',
    type: SubscriptionPackageDto,
  })
  @ValidateNested()
  @Type(() => SubscriptionPackageDto)
  subscription: SubscriptionPackageDto;

  @ApiPropertyOptional({
    description: 'Coupon code for discount',
    example: 'PROMO20',
  })
  @IsOptional()
  @IsString()
  coupon_code?: string;
}

export class PaymentInfoDto {
  @ApiProperty({
    description: 'Payment intent ID',
    example: 'payment_123456789_abc',
  })
  payment_id: string;

  @ApiProperty({
    description: 'Payment URL for completing the transaction',
    example: 'https://payment-gateway.example.com/pay/payment_123456789_abc',
  })
  payment_url: string;

  @ApiProperty({
    description: 'Payment amount',
    example: 299.99,
  })
  amount: number;

  @ApiProperty({
    description: 'Payment currency',
    example: 'USD',
  })
  currency: string;

  @ApiProperty({
    description: 'Payment expiration time',
    example: '2025-01-02T10:30:00.000Z',
  })
  expires_at: Date;
}

export class PremiumMembershipResponseDto {
  @ApiProperty({
    description: 'Application status',
    example: 'pending_payment',
  })
  status: string;

  @ApiProperty({
    description: 'Service type',
    example: 'premium_membership',
  })
  service_type: string;

  @ApiProperty({
    description: 'Service ID',
    example: 'uuid-service-id',
  })
  service_id: string;

  @ApiProperty({
    description: 'Payment information',
    type: PaymentInfoDto,
  })
  payment: PaymentInfoDto;

  @ApiProperty({
    description: 'Subscription details',
    type: SubscriptionStatusDto,
  })
  subscription: SubscriptionStatusDto;
}

export class ApprovePaymentSlipDto {
  @ApiPropertyOptional({
    description: 'Admin notes for the approval',
    example: 'Payment verified and matches package fee',
  })
  @IsOptional()
  @IsString()
  admin_notes?: string;
}

export class RejectPaymentSlipDto {
  @ApiProperty({
    description: 'Rejection reason (required when rejecting)',
    example: 'Slip is blurry / amount mismatch',
  })
  @IsString()
  rejection_reason: string;

  @ApiPropertyOptional({
    description: 'Additional admin notes (optional)',
    example: 'Customer will resubmit with clearer photo',
  })
  @IsOptional()
  @IsString()
  admin_notes?: string;
}
