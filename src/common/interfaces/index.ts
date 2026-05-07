export interface JwtPayload {
  sub: string;
  username: string;
  type: 'user' | 'customer';
  roleId?: string;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  id: string;
  username: string;
  roleId?: string;
  permissions?: string[];
}

export interface AuthCustomer {
  id: string;
  username?: string;
  email?: string;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'ASC' | 'DESC';
  is_demo?: boolean;
  search?: string;
}

export interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
}

// Re-export standardized response shapes (single & many)
export type { IOneResponse, IManyResponse } from '../utils/response.util';
