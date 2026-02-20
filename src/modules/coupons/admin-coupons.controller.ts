import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    UseGuards,
    ValidationPipe,
    ParseUUIDPipe,
    ForbiddenException,
    Query,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { JwtUserAuthGuard } from '../auth/guards/jwt-user.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import type { JwtPayload } from '../../common/interfaces';
import { CouponsService } from './coupons.service';
import { CreateCouponDto, UpdateCouponDto, CouponFilterDto } from './dto/coupon.dto';
import { handleSuccessOne, handleSuccessPaginated } from '../../common/utils/response.util';

@ApiTags('Admin Coupons')
@ApiBearerAuth()
@Controller('admin/coupons')
@UseGuards(JwtUserAuthGuard, PermissionsGuard)
export class AdminCouponsController {
    constructor(private readonly service: CouponsService) { }

    @Post()
    @Permissions('coupons:create')
    @ApiOperation({ summary: 'Create a new coupon' })
    @ApiBody({ type: CreateCouponDto })
    async create(
        @Body(ValidationPipe) dto: CreateCouponDto,
        @AuthUser() user: JwtPayload,
    ) {
        if (user.type !== 'user') throw new ForbiddenException();
        const data = await this.service.create(dto);
        return handleSuccessOne({
            data,
            message: 'Coupon created successfully',
            statusCode: 201,
        });
    }

    @Get()
    @Permissions('coupons:read')
    @ApiOperation({ summary: 'List all coupons' })
    async findAll(
        @Query(ValidationPipe) filter: CouponFilterDto,
        @AuthUser() user: JwtPayload,
    ) {
        if (user.type !== 'user') throw new ForbiddenException();
        const result = await this.service.findAll(filter);
        return handleSuccessPaginated({
            data: result.data,
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
            message: 'Coupons retrieved successfully',
        });
    }

    @Get(':id')
    @Permissions('coupons:read')
    @ApiOperation({ summary: 'Get coupon by ID' })
    @ApiParam({ name: 'id', description: 'Coupon ID' })
    async findOne(
        @Param('id', ParseUUIDPipe) id: string,
        @AuthUser() user: JwtPayload,
    ) {
        if (user.type !== 'user') throw new ForbiddenException();
        const data = await this.service.findOne(id);
        return handleSuccessOne({
            data,
            message: 'Coupon retrieved successfully',
        });
    }

    @Put(':id')
    @Permissions('coupons:update')
    @ApiOperation({ summary: 'Update coupon' })
    @ApiParam({ name: 'id', description: 'Coupon ID' })
    @ApiBody({ type: UpdateCouponDto })
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body(ValidationPipe) dto: UpdateCouponDto,
        @AuthUser() user: JwtPayload,
    ) {
        if (user.type !== 'user') throw new ForbiddenException();
        const data = await this.service.update(id, dto);
        return handleSuccessOne({
            data,
            message: 'Coupon updated successfully',
        });
    }

    @Delete(':id')
    @Permissions('coupons:delete')
    @ApiOperation({ summary: 'Delete coupon' })
    @ApiParam({ name: 'id', description: 'Coupon ID' })
    async remove(
        @Param('id', ParseUUIDPipe) id: string,
        @AuthUser() user: JwtPayload,
    ) {
        if (user.type !== 'user') throw new ForbiddenException();
        await this.service.remove(id);
        return handleSuccessOne({
            data: null,
            message: 'Coupon deleted successfully',
        });
    }
}
