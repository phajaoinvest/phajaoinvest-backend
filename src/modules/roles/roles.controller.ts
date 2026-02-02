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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtUserAuthGuard } from '../auth/guards/jwt-user.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import type { JwtPayload } from '../../common/interfaces';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  handleSuccessPaginated,
  handleSuccessOne,
} from '../../common/utils/response.util';

class CreateRoleDto {
  name!: string;
  description?: string;
}
class UpdateRoleDto {
  name?: string;
  description?: string;
}
class AssignPermissionDto {
  permission_id!: string;
}
class AssignMultiplePermissionsDto {
  permission_ids!: string[];
}

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('roles:create')
  @ApiOperation({ summary: 'Create role' })
  @ApiBody({ type: CreateRoleDto })
  async create(@Body(ValidationPipe) dto: CreateRoleDto) {
    const data = await this.service.create(dto);
    return handleSuccessOne({ data, message: 'Role created', statusCode: 200 });
  }

  @Get()
  @ApiOperation({ summary: 'List roles (paginated)' })
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
      message: 'Roles fetched',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get role by id' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.findOne(id);
    return handleSuccessOne({ data, message: 'Role found' });
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('roles:update')
  @ApiOperation({ summary: 'Update role' })
  @ApiBody({ type: UpdateRoleDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) dto: UpdateRoleDto,
  ) {
    const data = await this.service.update(id, dto);
    return handleSuccessOne({ data, message: 'Role updated' });
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('roles:delete')
  @ApiOperation({ summary: 'Delete role' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(id);
    return handleSuccessOne({ data: null, message: 'Role deleted' });
  }

  // Role-Permission Management Endpoints

  @Get(':id/permissions')
  @UseGuards(JwtUserAuthGuard)
  @ApiOperation({ summary: 'Get permissions assigned to a role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({
    status: 200,
    description: 'Role permissions retrieved successfully',
  })
  async getPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthUser() user: JwtPayload,
  ) {
    if (user.type !== 'user') {
      throw new ForbiddenException('Only admins can view role permissions');
    }
    const data = await this.service.getPermissions(id);
    return handleSuccessOne({ data, message: 'Role permissions fetched' });
  }

  @Post(':id/permissions')
  @UseGuards(JwtUserAuthGuard, PermissionsGuard)
  @Permissions('roles:update')
  @ApiOperation({ summary: 'Assign a permission to a role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiBody({ type: AssignPermissionDto })
  @ApiResponse({
    status: 200,
    description: 'Permission assigned successfully',
  })
  async assignPermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) dto: AssignPermissionDto,
    @AuthUser() user: JwtPayload,
  ) {
    if (user.type !== 'user') {
      throw new ForbiddenException('Only admins can assign permissions');
    }
    const data = await this.service.assignPermission(id, dto.permission_id);
    return handleSuccessOne({ data, message: 'Permission assigned' });
  }

  @Delete(':id/permissions/:permissionId')
  @UseGuards(JwtUserAuthGuard, PermissionsGuard)
  @Permissions('roles:update')
  @ApiOperation({ summary: 'Remove a permission from a role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiParam({ name: 'permissionId', description: 'Permission ID to remove' })
  @ApiResponse({
    status: 200,
    description: 'Permission removed successfully',
  })
  async removePermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('permissionId', ParseUUIDPipe) permissionId: string,
    @AuthUser() user: JwtPayload,
  ) {
    if (user.type !== 'user') {
      throw new ForbiddenException('Only admins can remove permissions');
    }
    await this.service.removePermission(id, permissionId);
    return handleSuccessOne({ data: null, message: 'Permission removed' });
  }

  @Post(':id/permissions/bulk')
  @UseGuards(JwtUserAuthGuard, PermissionsGuard)
  @Permissions('roles:update')
  @ApiOperation({ summary: 'Assign multiple permissions to a role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiBody({ type: AssignMultiplePermissionsDto })
  @ApiResponse({
    status: 200,
    description: 'Permissions assigned (with success/failure status for each)',
  })
  async assignMultiplePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) dto: AssignMultiplePermissionsDto,
    @AuthUser() user: JwtPayload,
  ) {
    if (user.type !== 'user') {
      throw new ForbiddenException('Only admins can assign permissions');
    }
    const data = await this.service.assignMultiplePermissions(
      id,
      dto.permission_ids,
    );
    return handleSuccessOne({
      data,
      message: 'Permissions assignment complete',
    });
  }

  @Delete(':id/permissions/bulk')
  @UseGuards(JwtUserAuthGuard, PermissionsGuard)
  @Permissions('roles:update')
  @ApiOperation({ summary: 'Remove multiple permissions from a role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiBody({ type: AssignMultiplePermissionsDto })
  @ApiResponse({
    status: 200,
    description: 'Permissions removed (with success/failure status for each)',
  })
  async removeMultiplePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) dto: AssignMultiplePermissionsDto,
    @AuthUser() user: JwtPayload,
  ) {
    if (user.type !== 'user') {
      throw new ForbiddenException('Only admins can remove permissions');
    }
    const data = await this.service.removeMultiplePermissions(
      id,
      dto.permission_ids,
    );
    return handleSuccessOne({ data, message: 'Permissions removal complete' });
  }
}
