import {
    Controller,
    Post,
    Body,
    UseGuards,
    ValidationPipe,
    ForbiddenException,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { JwtCustomerAuthGuard } from '../auth/guards/jwt-customer.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import type { JwtPayload } from '../../common/interfaces';
import { CouponsService } from './coupons.service';
import { ValidateCouponDto, CalculatedDiscountDto } from './dto/coupon.dto';
import { handleSuccessOne } from '../../common/utils/response.util';

@ApiTags('Coupons')
@ApiBearerAuth()
@Controller('coupons')
@UseGuards(JwtCustomerAuthGuard)
export class CouponsController {
    constructor(private readonly service: CouponsService) { }

    @Post('validate')
    @ApiOperation({ summary: 'Validate a coupon and calculate discount' })
    @ApiBody({ type: ValidateCouponDto })
    @ApiResponse({
        status: 200,
        description: 'Coupon is valid, returns discount details',
        type: CalculatedDiscountDto,
    })
    async validate(
        @Body(ValidationPipe) dto: ValidateCouponDto,
        @AuthUser() user: JwtPayload,
    ) {
        if (user.type !== 'customer') throw new ForbiddenException();

        const coupon = await this.service.validateCoupon(
            dto.code,
            dto.service_type,
            dto.amount,
            user.sub,
        );

        const data = this.service.calculateDiscount(coupon, dto.amount);

        return handleSuccessOne({
            data,
            message: 'Coupon is valid',
        });
    }
}
