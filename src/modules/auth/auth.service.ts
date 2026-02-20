import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs'; // kept for backward compatibility with existing hashes
import * as argon2 from 'argon2';

// Typed adapter interface to avoid unsafe any/error typed value warnings
interface Argon2Adapter {
  argon2id: number;
  hash(
    password: string | Buffer,
    options?: {
      type?: number;
      memoryCost?: number;
      timeCost?: number;
      parallelism?: number;
      raw?: boolean;
      version?: number;
      hashLength?: number;
      salt?: Buffer | string;
      saltLength?: number;
    },
  ): Promise<string>;
  verify(hash: string | Buffer, password: string | Buffer): Promise<boolean>;
}

// Extract and strongly type only the members we use
const _argon2 = argon2 as unknown as Argon2Adapter;
const argon2id = _argon2.argon2id;
const argon2Hash = (
  password: string | Buffer,
  options?: Parameters<Argon2Adapter['hash']>[1],
) => _argon2.hash(password, options);
const argon2Verify = (hash: string | Buffer, password: string | Buffer) =>
  _argon2.verify(hash, password);
import { User } from '../users/entities/user.entity';
import { Customer } from '../customers/entities/customer.entity';
import { LoginDto, CustomerLoginDto, LoginResponseDto } from './dto/auth.dto';
import { CustomerRegisterDto } from './dto/register.dto';
import { JwtPayload } from '../../common/interfaces';
import { WalletsService } from '../wallets/wallets.service';
import { SessionsService } from '../sessions/sessions.service';
import { CustomersService } from '../customers/customers.service';
import { CustomerServiceType } from '../customers/entities/customer-service.entity';
import { parseDeviceContext } from '../../common/utils/device.util';
import { lookupGeoLocation } from '../../common/utils/geoip.util';

// 2FA Rate limiting - prevent brute force attacks
interface TwoFactorAttempt {
  attempts: number;
  lastAttempt: number;
  lockedUntil?: number;
}

const MAX_2FA_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000; // 5 minute window for counting attempts

@Injectable()
export class AuthService {
  // In-memory store for 2FA rate limiting (use Redis in production for scaling)
  private twoFactorAttempts: Map<string, TwoFactorAttempt> = new Map();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly walletsService: WalletsService,
    private readonly sessionsService: SessionsService,
    private readonly customersService: CustomersService,
  ) { }

  /**
   * Check and update 2FA rate limiting for a user
   */
  private check2FAAttemptLimit(userId: string): void {
    const now = Date.now();
    const attempt = this.twoFactorAttempts.get(userId);

    if (attempt) {
      // Check if currently locked out
      if (attempt.lockedUntil && now < attempt.lockedUntil) {
        const remainingMinutes = Math.ceil((attempt.lockedUntil - now) / 60000);
        throw new BadRequestException(
          `Too many failed 2FA attempts. Please try again in ${remainingMinutes} minute(s).`,
        );
      }

      // Reset if outside the attempt window
      if (now - attempt.lastAttempt > ATTEMPT_WINDOW_MS) {
        this.twoFactorAttempts.delete(userId);
      }
    }
  }

  /**
   * Record a failed 2FA attempt
   */
  private record2FAFailedAttempt(userId: string): void {
    const now = Date.now();
    const attempt = this.twoFactorAttempts.get(userId);

    if (attempt) {
      attempt.attempts += 1;
      attempt.lastAttempt = now;

      if (attempt.attempts >= MAX_2FA_ATTEMPTS) {
        attempt.lockedUntil = now + LOCKOUT_DURATION_MS;
      }
    } else {
      this.twoFactorAttempts.set(userId, {
        attempts: 1,
        lastAttempt: now,
      });
    }
  }

  /**
   * Clear 2FA attempts on successful verification
   */
  private clear2FAAttempts(userId: string): void {
    this.twoFactorAttempts.delete(userId);
  }

  async loginUser(
    loginDto: LoginDto,
  ): Promise<
    | LoginResponseDto
    | { requires_2fa: boolean; temp_token: string; message: string }
  > {
    const user = await this.userRepository.findOne({
      where: { username: loginDto.username },
      relations: ['role'],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await this.verifyPassword(
      loginDto.password,
      user.password,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if 2FA is enabled
    if (user.two_factor_enabled) {
      // Create a temporary token for 2FA verification
      const secret =
        this.configService.get<string>('JWT_ADMIN_SECRET') ||
        this.configService.get<string>('JWT_SECRET', 'your-secret-key');

      const tempToken = this.jwtService.sign(
        { sub: user.id, type: '2fa_pending' },
        { secret, expiresIn: '5m' }, // 5 minutes to complete 2FA
      );

      return {
        requires_2fa: true,
        temp_token: tempToken,
        message: 'Two-factor authentication required',
      };
    }

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      type: 'user',
      roleId: user.role_id,
    };

    const secret =
      this.configService.get<string>('JWT_ADMIN_SECRET') ||
      this.configService.get<string>('JWT_SECRET', 'your-secret-key');
    const access_token = this.jwtService.sign(payload, { secret });

    return {
      access_token,
      token_type: 'Bearer',
      expires_in: 86400, // 24 hours
      user: {
        id: user.id,
        username: user.username,
        role: user.role?.name || undefined,
      },
    };
  }

  /**
   * Verify 2FA code and complete login
   */
  async verifyTwoFactorLogin(
    tempToken: string,
    code?: string,
    backupCode?: string,
  ): Promise<LoginResponseDto> {
    const { authenticator } = await import('otplib');

    // Verify the temp token
    const secret =
      this.configService.get<string>('JWT_ADMIN_SECRET') ||
      this.configService.get<string>('JWT_SECRET', 'your-secret-key');

    let payload: { sub: string; type: string };
    try {
      payload = this.jwtService.verify(tempToken, { secret });
    } catch {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    if (payload.type !== '2fa_pending') {
      throw new UnauthorizedException('Invalid token type');
    }

    const userId = payload.sub;

    // Check rate limiting BEFORE verifying code
    this.check2FAAttemptLimit(userId);

    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['role'],
    });

    if (!user || !user.two_factor_enabled || !user.two_factor_secret) {
      throw new UnauthorizedException('2FA not properly configured');
    }

    // At this point, two_factor_secret is guaranteed to be non-null
    const twoFactorSecret = user.two_factor_secret;

    // Verify either TOTP code or backup code
    let verified = false;

    if (code) {
      verified = authenticator.verify({
        token: code,
        secret: twoFactorSecret,
      });
    } else if (backupCode) {
      // Hash the backup code and check against stored codes
      const crypto = await import('crypto');
      const hashedCode = crypto
        .createHash('sha256')
        .update(backupCode.toUpperCase().replace(/\s/g, ''))
        .digest('hex');

      const backupCodes: string[] = user.two_factor_backup_codes || [];
      const codeIndex = backupCodes.findIndex((c: string) => c === hashedCode);

      if (codeIndex !== -1) {
        verified = true;
        // Remove the used backup code
        backupCodes.splice(codeIndex, 1);
        user.two_factor_backup_codes = backupCodes;
        await this.userRepository.save(user);
      }
    }

    if (!verified) {
      // Record failed attempt for rate limiting
      this.record2FAFailedAttempt(userId);
      throw new UnauthorizedException('Invalid verification code');
    }

    // Clear rate limiting on successful verification
    this.clear2FAAttempts(userId);

    // Generate full access token
    const jwtPayload: JwtPayload = {
      sub: user.id,
      username: user.username,
      type: 'user',
      roleId: user.role_id,
    };

    const access_token = this.jwtService.sign(jwtPayload, { secret });

    return {
      access_token,
      token_type: 'Bearer',
      expires_in: 86400, // 24 hours
      user: {
        id: user.id,
        username: user.username,
        role: user.role?.name || undefined,
      },
    };
  }

  async loginCustomer(
    loginDto: CustomerLoginDto,
    deviceRaw?: {
      userAgent?: string;
      ipAddress?: string;
      providedDeviceId?: string;
      providedDeviceName?: string;
      country?: string;
      province?: string;
      district?: string;
      latitude?: number;
      longitude?: number;
    },
  ): Promise<
    LoginResponseDto & {
      refresh_token?: string;
      session_id?: string;
      device_id?: string;
      device_name?: string;
      country?: string;
      province?: string;
      district?: string;
      latitude?: number;
      longitude?: number;
    }
  > {
    const whereCondition = loginDto.username
      ? { username: loginDto.username }
      : { email: loginDto.email };

    const customer = await this.customerRepository.findOne({
      where: whereCondition,
    });

    if (!customer || !customer.password) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const passwordValid = await this.verifyPassword(
      loginDto.password,
      customer.password,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Create persistent session + refresh token
    const refreshTtlDays = Number(
      this.configService.get<string>('CUSTOMER_REFRESH_TTL_DAYS', '30'),
    );
    // Always trace location from backend IP
    const geo = lookupGeoLocation(deviceRaw?.ipAddress || '');
    const parsed = parseDeviceContext({
      ...deviceRaw,
      country: geo.country,
      province: geo.province,
      district: geo.district,
      latitude: geo.latitude,
      longitude: geo.longitude,
    });
    const { session, refreshToken } = await this.sessionsService.create({
      customerId: customer.id,
      refreshTtlDays,
      userAgent: parsed.userAgent,
      ipAddress: parsed.ipAddress,
      deviceId: parsed.deviceId,
      deviceName: parsed.deviceName,
      metadata: parsed.metadata,
      country: parsed.country,
      province: parsed.province,
      district: parsed.district,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      geo_location: geo.geo as Record<string, unknown>,
    });

    const payload: JwtPayload & { sid: string } = {
      sub: customer.id,
      username: customer.username || customer.email || '',
      type: 'customer',
      sid: session.id,
    };

    const secret =
      this.configService.get<string>('JWT_CUSTOMER_SECRET') ||
      this.configService.get<string>('JWT_SECRET', 'your-secret-key');
    const access_token = this.jwtService.sign(payload, { secret });

    return {
      access_token,
      token_type: 'Bearer',
      expires_in: 86400, // 24 hours
      refresh_token: refreshToken,
      session_id: session.id,
      customer: {
        id: customer.id,
        username: customer.username,
        email: customer.email,
      },
      device_id: session.device_id,
      device_name: session.device_name,
      country: session.country,
      province: session.province,
      district: session.district,
      latitude: session.latitude,
      longitude: session.longitude,
    };
  }

  async hashPassword(password: string): Promise<string> {
    const hashed = await argon2Hash(password, {
      type: argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });
    return hashed;
  }

  private async verifyPassword(
    plain: string,
    stored: string,
  ): Promise<boolean> {
    const debug = process.env.AUTH_DEBUG === '1';
    const dbg = (...a: unknown[]) =>
      debug && console.log('[AUTH:verifyPassword]', ...a);
    try {
      dbg('inputs', {
        plainLength: plain?.length,
        storedPrefix: stored?.slice(0, 15),
        storedLength: stored?.length,
      });
      if (debug) {
        const codes = Array.from(plain || '').map((c) => c.charCodeAt(0));
        dbg('plainCharCodes', codes);
      }
      if (!plain || !stored) {
        dbg('either plain or stored empty');
        return false;
      }
      if (stored.startsWith('$argon2')) {
        const t0 = Date.now();
        const ok = await argon2Verify(stored, plain);
        dbg('argon2.verify', { ok, elapsedMs: Date.now() - t0 });
        return ok;
      }
      if (
        stored.startsWith('$2a$') ||
        stored.startsWith('$2b$') ||
        stored.startsWith('$2y$')
      ) {
        const t0 = Date.now();
        const ok = await bcrypt.compare(plain, stored);
        dbg('bcrypt.compare', { ok, elapsedMs: Date.now() - t0 });
        return ok;
      }
      dbg('unexpected format (comparing as literal)');
      const direct = plain === stored;
      dbg('directStringEquality', direct);
      return direct;
    } catch (err) {
      dbg('error', err);
      return false;
    }
  }

  async registerCustomer(dto: CustomerRegisterDto): Promise<{
    id: string;
    username: string;
    email: string;
    first_name?: string;
    last_name?: string;
    wallet_id: string;
  }> {
    // Basic password strength validation (length + character class diversity)
    this.ensurePasswordStrength(dto.password);
    // Ensure uniqueness on username or email
    const normalizedUsername = dto.username.trim();
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingByUsername = await this.customerRepository.findOne({
      where: { username: normalizedUsername },
    });
    if (existingByUsername) {
      throw new ConflictException('Username already taken');
    }
    const existingByEmail = await this.customerRepository.findOne({
      where: { email: normalizedEmail },
    });
    if (existingByEmail) {
      throw new ConflictException('Email already registered');
    }

    const hashed = await this.hashPassword(dto.password);
    const entity = this.customerRepository.create({
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashed,
      first_name: dto.first_name?.trim(),
      last_name: dto.last_name?.trim(),
    });
    let saved: Customer;
    try {
      saved = await this.customerRepository.save(entity);
    } catch (err: unknown) {
      // Handle potential race condition on unique username/email (Postgres 23505)
      if (
        typeof err === 'object' &&
        err &&
        'code' in err &&
        (err as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('Username or email already exists');
      }
      throw err;
    }

    // Create wallet for this customer (idempotent assumption: first creation only)
    const wallet = await this.walletsService.create({ customerId: saved.id });

    // Automatically apply premium_stock_picks service and approve it immediately
    try {
      await this.customersService.applyService(
        saved.id,
        CustomerServiceType.PREMIUM_STOCK_PICKS,
      );
    } catch (error) {
      // Log the error but don't fail registration if service application fails
      console.error('Failed to auto-apply premium_stock_picks service:', error);
    }

    return {
      id: saved.id,
      username: saved.username,
      email: saved.email,
      first_name: saved.first_name,
      last_name: saved.last_name,
      wallet_id: wallet.id,
    };
  }

  // --- Password Strength Helper ---
  private ensurePasswordStrength(password: string) {
    const minLength = 10; // increase if policy requires
    if (!password || password.length < minLength) {
      throw new ConflictException(
        `Password too weak: must be at least ${minLength} characters`,
      );
    }
    const classes = [
      /[a-z]/.test(password),
      /[A-Z]/.test(password),
      /[0-9]/.test(password),
      /[^A-Za-z0-9]/.test(password),
    ].filter(Boolean).length;
    if (classes < 3) {
      throw new ConflictException(
        'Password too weak: include at least three of lowercase, uppercase, number, symbol',
      );
    }
  }

  // --- Session & Refresh Token Management ---
  async refreshCustomerToken(sessionId: string, refreshToken: string) {
    const refreshTtlDays = Number(
      this.configService.get<string>('CUSTOMER_REFRESH_TTL_DAYS', '30'),
    );
    const { session, refreshToken: newToken } =
      await this.sessionsService.rotate({
        sessionId,
        currentRefreshToken: refreshToken,
        refreshTtlDays,
      });
    // Build new access token
    const customer = await this.customerRepository.findOne({
      where: { id: session.customer_id },
    });
    if (!customer) throw new UnauthorizedException('Customer not found');
    const payload: JwtPayload & { sid: string } = {
      sub: customer.id,
      username: customer.username || customer.email || '',
      type: 'customer',
      sid: session.id,
    };
    const secret =
      this.configService.get<string>('JWT_CUSTOMER_SECRET') ||
      this.configService.get<string>('JWT_SECRET', 'your-secret-key');
    const access_token = this.jwtService.sign(payload, { secret });
    return {
      access_token,
      token_type: 'Bearer',
      expires_in: 86400,
      refresh_token: newToken,
      session_id: session.id,
    };
  }

  async listCustomerSessions(customerId: string) {
    return this.sessionsService.listByCustomer(customerId);
  }

  async revokeCustomerSession(customerId: string, sessionId: string) {
    await this.sessionsService.revoke(sessionId, customerId, 'manual_logout');
    return { session_id: sessionId };
  }

  async revokeOtherCustomerSessions(
    customerId: string,
    currentSessionId: string,
  ) {
    const count = await this.sessionsService.revokeOthers(
      currentSessionId,
      customerId,
    );
    return { revoked: count };
  }

  async revokeAllCustomerSessions(customerId: string) {
    const count = await this.sessionsService.revokeAll(customerId);
    return { revoked: count };
  }

  // ============ Admin Profile Management ============

  async getAdminProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['role'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      tel: user.tel,
      gender: user.gender,
      address: user.address,
      status: user.status,
      profile: user.profile,
      role: user.role?.name || undefined,
      role_id: user.role_id,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  async updateAdminProfile(
    userId: string,
    updateDto: {
      first_name?: string;
      last_name?: string;
      tel?: string;
      address?: string;
    },
  ) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Update only provided fields
    if (updateDto.first_name !== undefined) {
      user.first_name = updateDto.first_name;
    }
    if (updateDto.last_name !== undefined) {
      user.last_name = updateDto.last_name;
    }
    if (updateDto.tel !== undefined) {
      user.tel = updateDto.tel;
    }
    if (updateDto.address !== undefined) {
      user.address = updateDto.address;
    }

    await this.userRepository.save(user);

    return this.getAdminProfile(userId);
  }

  async changeAdminPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify current password
    const passwordValid = await this.verifyPassword(
      currentPassword,
      user.password,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash new password with argon2
    const hashedPassword = await argon2Hash(newPassword, {
      type: argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    user.password = hashedPassword;
    await this.userRepository.save(user);

    return { message: 'Password changed successfully' };
  }
}
