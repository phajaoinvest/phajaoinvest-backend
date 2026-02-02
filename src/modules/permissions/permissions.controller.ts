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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions as PermissionMeta } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  handleSuccessPaginated,
  handleSuccessOne,
} from '../../common/utils/response.util';

class CreatePermissionDto {
  name!: string;
  description?: string;
}
class UpdatePermissionDto {
  name?: string;
  description?: string;
}

@ApiTags('permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @PermissionMeta('permissions:create')
  @ApiOperation({ summary: 'Create permission' })
  @ApiBody({ type: CreatePermissionDto })
  async create(@Body(ValidationPipe) dto: CreatePermissionDto) {
    const data = await this.service.create(dto);
    return handleSuccessOne({
      data,
      message: 'Permission created',
      statusCode: 200,
    });
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @PermissionMeta('permissions:read')
  @ApiOperation({ summary: 'List permissions (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.service.findAll(query);
    return handleSuccessPaginated({
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      message: 'Permissions fetched',
    });
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @PermissionMeta('permissions:read')
  @ApiOperation({ summary: 'Get permission by id' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.findOne(id);
    return handleSuccessOne({ data, message: 'Permission found' });
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @PermissionMeta('permissions:update')
  @ApiOperation({ summary: 'Update permission' })
  @ApiBody({ type: UpdatePermissionDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) dto: UpdatePermissionDto,
  ) {
    const data = await this.service.update(id, dto);
    return handleSuccessOne({ data, message: 'Permission updated' });
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @PermissionMeta('permissions:delete')
  @ApiOperation({ summary: 'Delete permission' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(id);
    return handleSuccessOne({ data: null, message: 'Permission deleted' });
  }
}
