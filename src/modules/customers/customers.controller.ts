import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ValidationPipe,
  ParseUUIDPipe,
  ForbiddenException,
  Req,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { Customer } from './entities/customer.entity';
import { CustomerStatus } from '../../common/enums';
import { CustomerServiceType } from './entities/customer-service.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtUserAuthGuard } from '../auth/guards/jwt-user.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import type { JwtPayload } from '../../common/interfaces';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  handleSuccessPaginated,
  handleSuccessOne,
  IPaginatedResponse,
} from '../../common/utils/response.util';
import {
  ForgotPasswordDto,
  ResetPasswordWithOtpDto,
  ResetPasswordWithTokenDto,
  ForgotPasswordResponseDto,
  ResetPasswordResponseDto,
} from './dto/password-reset.dto';

class CreateCustomerDto {
  username!: string;
  email!: string;
  password!: string;
}
class UpdateCustomerDto {
  username?: string;
  email?: string;
  password?: string;
}

class UpdateCustomerStatusDto {
  status!: CustomerStatus;
}

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) { }

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('customers:create')
  @ApiOperation({ summary: 'Create customer' })
  @ApiBody({ type: CreateCustomerDto })
  async create(@Body(ValidationPipe) dto: CreateCustomerDto) {
    const data = await this.service.create(dto);
    return handleSuccessOne({
      data,
      message: 'Customer created',
      statusCode: 200,
    });
  }

  @Get('stats')
  @UseGuards(PermissionsGuard)
  @Permissions('customers:read')
  @ApiOperation({ summary: 'Get customer statistics [staff only]' })
  async getStats() {
    const data = await this.service.getStats();
    return handleSuccessOne({ data, message: 'Customer stats fetched' });
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('customers:read')
  @ApiOperation({ summary: 'List customers (paginated) [staff only]' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async findAll(
    @Query()
    query: PaginationQueryDto & {
      search?: string;
      status?: CustomerStatus;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<IPaginatedResponse<Customer>> {
    const result = await this.service.findAll(query);
    return handleSuccessPaginated({
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      message: 'Customers fetched',
    });
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('customers:read')
  @ApiOperation({ summary: 'Get customer by id [staff only]' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.findOne(id);
    return handleSuccessOne({ data, message: 'Customer found' });
  }

  @Get(':id/detailed')
  @UseGuards(PermissionsGuard)
  @Permissions('customers:read')
  @ApiOperation({
    summary:
      'Get comprehensive customer details with KYC, documents, and services [staff only]',
  })
  @ApiResponse({ status: 200, description: 'Customer details retrieved' })
  async getCustomerDetailed(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('service_type') serviceType?: CustomerServiceType,
  ) {
    const data = await this.service.getCustomerDetailedForAdmin(
      id,
      serviceType,
    );
    return handleSuccessOne({ data, message: 'Customer details retrieved' });
  }

  @Get('profile/me')
  @ApiOperation({ summary: 'Get current customer profile (self)' })
  async profile(@AuthUser() user: JwtPayload) {
    // Only allow when token type is customer
    if (user.type !== 'customer') {
      // Reuse 403 semantics without importing ForbiddenException to keep minimal; could import instead.
      throw new ForbiddenException();
    }
    const data = await this.service.findOneWithServices(user.sub);
    return handleSuccessOne({ data, message: 'Customer profile' });
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('customers:update')
  @ApiOperation({ summary: 'Update customer' })
  @ApiBody({ type: UpdateCustomerDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) dto: UpdateCustomerDto,
  ) {
    const data = await this.service.update(id, dto);
    return handleSuccessOne({ data, message: 'Customer updated' });
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('customers:delete')
  @ApiOperation({ summary: 'Delete customer' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(id);
    return handleSuccessOne({ data: null, message: 'Customer deleted' });
  }

  // --- Admin Customer Status Management Endpoints ---

  @Put(':id/status')
  @UseGuards(JwtUserAuthGuard, PermissionsGuard)
  @Permissions('customers:update')
  @ApiOperation({ summary: 'Update customer status (admin)' })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiBody({ type: UpdateCustomerStatusDto })
  @ApiResponse({
    status: 200,
    description: 'Customer status updated successfully',
  })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) dto: UpdateCustomerStatusDto,
    @AuthUser() user: JwtPayload,
  ) {
    if (user.type !== 'user') {
      throw new ForbiddenException('Only admins can update customer status');
    }
    const data = await this.service.updateStatus(id, dto.status);
    return handleSuccessOne({
      data,
      message: 'Customer status updated successfully',
    });
  }

  @Put(':id/ban')
  @UseGuards(JwtUserAuthGuard, PermissionsGuard)
  @Permissions('customers:update')
  @ApiOperation({ summary: 'Ban customer (admin)' })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiResponse({
    status: 200,
    description: 'Customer banned successfully',
  })
  async banCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthUser() user: JwtPayload,
  ) {
    if (user.type !== 'user') {
      throw new ForbiddenException('Only admins can ban customers');
    }
    const data = await this.service.updateStatus(id, CustomerStatus.SUSPENDED);
    return handleSuccessOne({
      data,
      message: 'Customer banned successfully',
    });
  }

  @Put(':id/activate')
  @UseGuards(JwtUserAuthGuard, PermissionsGuard)
  @Permissions('customers:update')
  @ApiOperation({ summary: 'Activate customer (admin)' })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiResponse({
    status: 200,
    description: 'Customer activated successfully',
  })
  async activateCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthUser() user: JwtPayload,
  ) {
    if (user.type !== 'user') {
      throw new ForbiddenException('Only admins can activate customers');
    }
    const data = await this.service.updateStatus(id, CustomerStatus.ACTIVE);
    return handleSuccessOne({
      data,
      message: 'Customer activated successfully',
    });
  }

  @Put(':id/deactivate')
  @UseGuards(JwtUserAuthGuard, PermissionsGuard)
  @Permissions('customers:update')
  @ApiOperation({ summary: 'Deactivate customer (admin)' })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiResponse({
    status: 200,
    description: 'Customer deactivated successfully',
  })
  async deactivateCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthUser() user: JwtPayload,
  ) {
    if (user.type !== 'user') {
      throw new ForbiddenException('Only admins can deactivate customers');
    }
    const data = await this.service.updateStatus(id, CustomerStatus.INACTIVE);
    return handleSuccessOne({
      data,
      message: 'Customer deactivated successfully',
    });
  }

  // --- Password Reset Endpoints ---

  @Post('forgot-password')
  @Public()
  @ApiOperation({
    summary: 'Send password reset instructions',
    description: 'Send OTP or reset link to customer email for password reset',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset instructions sent successfully',
    type: ForgotPasswordResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or too many attempts',
  })
  async forgotPassword(
    @Body(ValidationPipe) dto: ForgotPasswordDto,
    @Req() req: { headers: Record<string, unknown>; ip?: string },
  ) {
    const context = {
      userAgent: req.headers['user-agent'] as string,
      ipAddress: req.ip,
    };

    const result = await this.service.forgotPassword(dto, context);
    return handleSuccessOne({
      data: result,
      message: 'Password reset instructions sent successfully',
    });
  }

  @Post('reset-password/otp')
  @Public()
  @ApiOperation({
    summary: 'Reset password using OTP',
    description: 'Reset password using the OTP code received via email',
  })
  @ApiBody({ type: ResetPasswordWithOtpDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    type: ResetPasswordResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid OTP, expired OTP, or validation error',
  })
  async resetPasswordWithOtp(
    @Body(ValidationPipe) dto: ResetPasswordWithOtpDto,
    @Req() req: { headers: Record<string, unknown>; ip?: string },
  ) {
    const context = {
      userAgent: req.headers['user-agent'] as string,
      ipAddress: req.ip,
    };

    const result = await this.service.resetPasswordWithOtp(dto, context);
    return handleSuccessOne({
      data: result,
      message: 'Password reset successfully',
    });
  }

  @Post('reset-password/token')
  @Public()
  @ApiOperation({
    summary: 'Reset password using reset token',
    description: 'Reset password using the reset token from email link',
  })
  @ApiBody({ type: ResetPasswordWithTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    type: ResetPasswordResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid token, expired token, or validation error',
  })
  async resetPasswordWithToken(
    @Body(ValidationPipe) dto: ResetPasswordWithTokenDto,
    @Req() req: { headers: Record<string, unknown>; ip?: string },
  ) {
    const context = {
      userAgent: req.headers['user-agent'] as string,
      ipAddress: req.ip,
    };

    const result = await this.service.resetPasswordWithToken(dto, context);
    return handleSuccessOne({
      data: result,
      message: 'Password reset successfully',
    });
  }
}
