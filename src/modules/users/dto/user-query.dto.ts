import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UserStatus } from '../../../common/enums';

export class UserQueryDto extends PaginationQueryDto {
    @ApiPropertyOptional({ example: 'admin', description: 'Search keyword' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ enum: UserStatus, description: 'Filter by status' })
    @IsOptional()
    @IsEnum(UserStatus)
    status?: UserStatus;
}
