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
import { UserStatus, Gender } from '../../common/enums';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import {
  handleSuccessPaginated,
  handleSuccessOne,
} from '../../common/utils/response.util';

class CreateUserDto {
  username!: string;
  password!: string;
  first_name!: string;
  last_name?: string;
  number?: string;
  gender?: Gender;
  tel?: string;
  address?: string;
  status?: UserStatus;
  profile?: string;
  role_id?: string;
}
class UpdateUserDto {
  username?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  number?: string;
  gender?: Gender;
  tel?: string;
  address?: string;
  status?: UserStatus;
  profile?: string;
  role_id?: string;
}

import { UserQueryDto } from './dto/user-query.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) { }

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('users:create')
  @ApiOperation({ summary: 'Create user' })
  @ApiBody({ type: CreateUserDto })
  async create(@Body(ValidationPipe) dto: CreateUserDto) {
    const data = await this.service.create(dto);
    return handleSuccessOne({ data, message: 'User created', statusCode: 200 });
  }

  @Get()
  @ApiOperation({ summary: 'List users (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  async findAll(@Query(ValidationPipe) query: UserQueryDto) {
    const result = await this.service.findAll(query);
    return handleSuccessPaginated({
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      message: 'Users fetched',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by id' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.findOne(id);
    return handleSuccessOne({ data, message: 'User found' });
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('users:update')
  @ApiOperation({ summary: 'Update user' })
  @ApiBody({ type: UpdateUserDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) dto: UpdateUserDto,
  ) {
    const data = await this.service.update(id, dto);
    return handleSuccessOne({ data, message: 'User updated' });
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('users:delete')
  @ApiOperation({ summary: 'Delete user' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(id);
    return handleSuccessOne({ data: null, message: 'User deleted' });
  }
}
