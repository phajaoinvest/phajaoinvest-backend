import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiParam,
} from '@nestjs/swagger';
import { TransferHistoryService } from '../transfer-history.service';
import { JwtCustomerAuthGuard } from '../../auth/guards/jwt-customer.guard';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  handleSuccessPaginated,
  handleSuccessOne,
} from '../../../common/utils/response.util';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import type { JwtPayload } from '../../../common/interfaces';

@ApiTags('Customer Transfer History')
@ApiBearerAuth()
@UseGuards(JwtCustomerAuthGuard)
@Controller('transfer-history')
export class CustomerTransferHistoryController {
  constructor(private readonly service: TransferHistoryService) { }

  @Get()
  @ApiOperation({ summary: 'List my transfers (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({
    name: 'sort',
    required: false,
    description: 'Sort field',
    example: 'created_at',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    description: 'Sort order',
    enum: ['ASC', 'DESC'],
    example: 'DESC',
  })
  @ApiQuery({
    name: 'start_date',
    required: false,
    description:
      'Filter by created_at start date (inclusive). YYYY-MM-DD or ISO',
  })
  @ApiQuery({
    name: 'end_date',
    required: false,
    description: 'Filter by created_at end date (inclusive). YYYY-MM-DD or ISO',
  })
  async findMine(
    @AuthUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
  ) {
    if (user.type !== 'customer')
      throw new ForbiddenException(
        'Only customers can access their transfer history',
      );

    let parsedStart = start_date ? new Date(start_date) : undefined;
    let parsedEnd = end_date ? new Date(end_date) : undefined;
    if (parsedStart && Number.isNaN(parsedStart.getTime()))
      parsedStart = undefined;
    if (parsedEnd && Number.isNaN(parsedEnd.getTime())) parsedEnd = undefined;

    const result = await this.service.findAllForCustomer(user.sub, query, {
      startDate: parsedStart,
      endDate: parsedEnd,
    });
    return handleSuccessPaginated({
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      message: 'Transfers fetched',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get my transfer by id' })
  @ApiParam({ name: 'id', description: 'Transfer history id' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthUser() user: JwtPayload,
  ) {
    if (user.type !== 'customer')
      throw new ForbiddenException(
        'Only customers can access their transfer history',
      );
    const data = await this.service.findOneForCustomer(id, user.sub);
    return handleSuccessOne({ data, message: 'Transfer found' });
  }
}
