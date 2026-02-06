import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { User } from './entities/user.entity';
import { UserStatus, Gender } from '../../common/enums';
import { UserQueryDto } from './dto/user-query.dto';

// DTO interfaces for clarity & reuse
export interface CreateUserDtoInternal {
  username: string;
  password: string;
  first_name: string;
  last_name?: string;
  number?: string;
  gender?: Gender;
  tel?: string;
  address?: string;
  status?: UserStatus;
  profile?: string;
  role_id?: string;
}

export interface UpdateUserDtoInternal {
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

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) { }

  async getUserPermissions(userId: string): Promise<string[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: [
        'role',
        'role.rolePermissions',
        'role.rolePermissions.permission',
      ],
    });

    if (!user || !user.role?.rolePermissions) {
      return [];
    }

    return user.role.rolePermissions
      .filter((rp) => rp.permission?.name)
      .map((rp) => rp.permission.name);
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['role'],
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { username },
      relations: ['role'],
    });
  }

  // ---- CRUD for administration (used by UsersController) ----
  async create(dto: CreateUserDtoInternal): Promise<User> {
    const entity = this.userRepository.create({
      ...dto,
      // Only assign relation if role_id provided
      ...(dto.role_id ? { role: { id: dto.role_id } as User['role'] } : {}),
    });
    return this.userRepository.save(entity);
  }

  async findAll(query: UserQueryDto): Promise<{
    data: User[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 10;

    const queryBuilder = this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .orderBy('user.created_at', 'DESC')
      .take(limit)
      .skip((page - 1) * limit);

    if (query.status) {
      queryBuilder.andWhere('user.status = :status', { status: query.status });
    }

    if (query.search) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('user.first_name ILIKE :search', { search: `%${query.search}%` })
            .orWhere('user.last_name ILIKE :search', { search: `%${query.search}%` })
            .orWhere('user.username ILIKE :search', { search: `%${query.search}%` })
            .orWhere('user.tel ILIKE :search', { search: `%${query.search}%` })
            .orWhere('user.number ILIKE :search', { search: `%${query.search}%` });
        }),
      );
    }

    const [data, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;
    return { data, total, page, limit, totalPages };
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['role'],
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDtoInternal): Promise<User> {
    const user = await this.findOne(id);

    // Apply basic fields
    if (dto.username !== undefined) user.username = dto.username;
    if (dto.password !== undefined) user.password = dto.password;
    if (dto.first_name !== undefined) user.first_name = dto.first_name;
    if (dto.last_name !== undefined) user.last_name = dto.last_name;
    if (dto.number !== undefined) user.number = dto.number;
    if (dto.gender !== undefined) user.gender = dto.gender;
    if (dto.tel !== undefined) user.tel = dto.tel;
    if (dto.address !== undefined) user.address = dto.address;
    if (dto.status !== undefined) user.status = dto.status;
    if (dto.profile !== undefined) user.profile = dto.profile;

    if (dto.role_id !== undefined) {
      // Preserve current relation if empty string/null passed -> detach
      if (dto.role_id) {
        user.role = { id: dto.role_id } as User['role'];
      } else {
        user.role = null as unknown as User['role'];
      }
    }
    return this.userRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }
}
