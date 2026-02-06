import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

interface CreateRoleDto {
  name: string;
  description?: string;
}
interface UpdateRoleDto {
  name?: string;
  description?: string;
}

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role) private readonly repo: Repository<Role>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) { }

  async create(dto: CreateRoleDto) {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(query: PaginationQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 10;
    const [data, total] = await this.repo.findAndCount({
      take: limit,
      skip: (page - 1) * limit,
      relations: ['rolePermissions'],
      order: { created_at: 'DESC' },
    });
    const totalPages = Math.ceil(total / limit) || 1;
    return { data, total, page, limit, totalPages };
  }

  async findOne(id: string) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Role not found');
    return entity;
  }

  async update(id: string, dto: UpdateRoleDto) {
    const entity = await this.findOne(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: string) {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
  }

  // Role-Permission Management

  async findOneWithPermissions(id: string) {
    const role = await this.repo.findOne({
      where: { id },
      relations: ['rolePermissions', 'rolePermissions.permission'],
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async getPermissions(roleId: string) {
    const role = await this.findOneWithPermissions(roleId);
    return role.rolePermissions
      .filter((rp) => rp.permission)
      .map((rp) => ({
        id: rp.id,
        permission_id: rp.permission_id,
        permission_name: rp.permission?.name,
        permission_description: rp.permission?.description,
        created_at: rp.created_at,
      }));
  }

  async assignPermission(roleId: string, permissionId: string) {
    // Verify role exists
    const role = await this.findOne(roleId);

    // Verify permission exists
    const permission = await this.permissionRepo.findOne({
      where: { id: permissionId },
    });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    // Check if already assigned
    const existing = await this.rolePermissionRepo.findOne({
      where: { role_id: roleId, permission_id: permissionId },
    });
    if (existing) {
      throw new BadRequestException('Permission already assigned to this role');
    }

    // Create the role-permission assignment
    const rolePermission = this.rolePermissionRepo.create({
      role_id: roleId,
      permission_id: permissionId,
      name: `${role.name}_${permission.name}`,
    });

    return this.rolePermissionRepo.save(rolePermission);
  }

  async removePermission(roleId: string, permissionId: string) {
    // Verify role exists
    await this.findOne(roleId);

    const rolePermission = await this.rolePermissionRepo.findOne({
      where: { role_id: roleId, permission_id: permissionId },
    });

    if (!rolePermission) {
      throw new NotFoundException('Permission not assigned to this role');
    }

    await this.rolePermissionRepo.remove(rolePermission);
  }

  async assignMultiplePermissions(roleId: string, permissionIds: string[]) {
    // Verify role exists
    const role = await this.findOne(roleId);

    const results: { permissionId: string; success: boolean; result?: RolePermission; error?: string }[] = [];
    for (const permissionId of permissionIds) {
      try {
        const result = await this.assignPermission(roleId, permissionId);
        results.push({ permissionId, success: true, result });
      } catch (error) {
        results.push({
          permissionId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  async syncPermissions(roleId: string, permissionIds: string[]) {
    // Verify role exists
    await this.findOne(roleId);

    // Get current permissions
    const currentMappings = await this.rolePermissionRepo.find({
      where: { role_id: roleId },
    });
    const currentIds = currentMappings.map((m) => m.permission_id);

    // To remove: currently assigned but NOT in the new list
    const toRemove = currentMappings.filter(
      (m) => !permissionIds.includes(m.permission_id),
    );

    // To add: in the new list but NOT currently assigned
    const toAdd = permissionIds.filter((id) => !currentIds.includes(id));

    // Remove old ones
    if (toRemove.length > 0) {
      await this.rolePermissionRepo.remove(toRemove);
    }

    // Add new ones
    const addResults: {
      id: string;
      success: boolean;
      result?: RolePermission;
      error?: string;
    }[] = [];
    for (const id of toAdd) {
      try {
        const result = await this.assignPermission(roleId, id);
        addResults.push({ id, success: true, result });
      } catch (error) {
        addResults.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      removed: toRemove.length,
      added: addResults.filter((r) => r.success).length,
      errors: addResults.filter((r) => !r.success),
    };
  }

  async removeMultiplePermissions(roleId: string, permissionIds: string[]) {
    // Verify role exists
    await this.findOne(roleId);

    const results: { permissionId: string; success: boolean; error?: string }[] = [];
    for (const permissionId of permissionIds) {
      try {
        await this.removePermission(roleId, permissionId);
        results.push({ permissionId, success: true });
      } catch (error) {
        results.push({
          permissionId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }
}
