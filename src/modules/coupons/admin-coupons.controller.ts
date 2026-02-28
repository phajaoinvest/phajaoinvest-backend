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
    @ApiOperation({ summary: 'Create a new coupon or bulk generate' })
    @ApiBody({ type: CreateCouponDto })
    async create(
        @Body(ValidationPipe) dto: CreateCouponDto,
        @AuthUser() user: JwtPayload,
    ) {
        if (user.type !== 'user') throw new ForbiddenException();
        const data = await this.service.create(dto);
        const isBulk = data.is_bulk;
        return handleSuccessOne({
            data,
            message: isBulk ? `Successfully generated ${data.total_coupons} coupons` : 'Coupon created successfully',
            statusCode: 201,
        });
    }

    @Get()
    @Permissions('coupons:read')
    @ApiOperation({ summary: 'List all coupon groups' })
    async findAllGroups(
        @Query(ValidationPipe) filter: CouponFilterDto,
        @AuthUser() user: JwtPayload,
    ) {
        if (user.type !== 'user') throw new ForbiddenException();
        const result = await this.service.findAllGroups(filter);
        return handleSuccessPaginated({
            data: result.data,
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
            message: 'Coupon groups retrieved successfully',
        });
    }

    @Get('group/:id')
    @Permissions('coupons:read')
    @ApiOperation({ summary: 'Get coupon group and its coupons by group ID' })
    async findGroup(
        @Param('id', ParseUUIDPipe) id: string,
        @AuthUser() user: JwtPayload,
    ) {
        if (user.type !== 'user') throw new ForbiddenException();
        const data = await this.service.findGroup(id);
        return handleSuccessOne({
            data,
            message: 'Group retrieved successfully',
        });
    }

    @Put(':id')
    @Permissions('coupons:update')
    @ApiOperation({ summary: 'Update coupon group' })
    @ApiParam({ name: 'id', description: 'Coupon Group ID' })
    @ApiBody({ type: UpdateCouponDto })
    async updateGroup(
        @Param('id', ParseUUIDPipe) id: string,
        @Body(ValidationPipe) dto: UpdateCouponDto,
        @AuthUser() user: JwtPayload,
    ) {
        if (user.type !== 'user') throw new ForbiddenException();
        const updatedData = await this.service.updateGroup(id, dto);
        return handleSuccessOne({
            data: updatedData,
            message: 'Coupon group updated successfully',
        });
    }

    @Delete(':id')
    @Permissions('coupons:delete')
    @ApiOperation({ summary: 'Delete coupon group' })
    @ApiParam({ name: 'id', description: 'Coupon Group ID' })
    async removeGroup(
        @Param('id', ParseUUIDPipe) id: string,
        @AuthUser() user: JwtPayload,
    ) {
        if (user.type !== 'user') throw new ForbiddenException();
        await this.service.removeGroup(id);
        return handleSuccessOne({
            data: null,
            message: 'Coupon group deleted successfully',
        });
    }
}
