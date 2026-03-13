import {
  Controller,
  Post,
  Body,
  ValidationPipe,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  AuthCustomerRegisterRequestExample,
  AuthCustomerRegisterResponseExample,
  AuthLoginUserRequestExample,
  AuthLoginUserResponseExample,
  AuthLoginCustomerRequestExample,
  AuthLoginCustomerResponseExample,
} from '../../docs/swagger';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import {
  LoginDto,
  CustomerLoginDto,
  LoginResponseDto,
  UpdateProfileDto,
  ChangePasswordDto,
} from './dto/auth.dto';
import {
  CustomerRegisterDto,
  CustomerRegisterResponseDto,
} from './dto/register.dto';
import {
  handleSuccessOne,
  IOneResponse,
} from '../../common/utils/response.util';
import { RefreshTokenDto } from './dto/session.dto';
import { JwtUserAuthGuard } from './guards/jwt-user.guard';
import {
  Verify2FADto,
  Disable2FADto,
  Regenerate2FADto,
  LoginWith2FADto,
} from './dto/two-factor.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactorService: TwoFactorService,
  ) { }

  @Post('customer/register')
  @ApiOperation({ summary: 'Register new customer account' })
  @ApiBody({
    description: 'Customer registration payload',
    schema: ((): Record<string, unknown> => ({
      type: 'object',
      properties: {
        username: { type: 'string' },
        email: { type: 'string' },
        password: { type: 'string' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        address: { type: 'string' },
      },
      example: AuthCustomerRegisterRequestExample,
    }))(),
  })
  @ApiResponse({
    status: 200,
    description: 'Customer created',
    type: CustomerRegisterResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Customer created (example)',
    schema: { example: AuthCustomerRegisterResponseExample },
  })
  @ApiResponse({ status: 409, description: 'Username or email already taken' })
  async registerCustomer(
    @Body(ValidationPipe) dto: CustomerRegisterDto,
  ): Promise<IOneResponse<CustomerRegisterResponseDto>> {
    const data = await this.authService.registerCustomer(dto);
    return handleSuccessOne({
      data,
      message: 'Customer registered',
      statusCode: 200,
    });
  }

  @Post('login')
  @ApiOperation({ summary: 'Admin/User login' })
  @ApiBody({
    description: 'Credentials for admin/user login',
    schema: ((): Record<string, unknown> => ({
      type: 'object',
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
      },
      example: AuthLoginUserRequestExample,
    }))(),
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful or 2FA required',
    schema: { example: AuthLoginUserResponseExample },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async loginUser(
    @Body(ValidationPipe) loginDto: LoginDto,
  ): Promise<
    IOneResponse<
      | LoginResponseDto
      | { requires_2fa: boolean; temp_token: string; message: string }
    >
  > {
    const data = await this.authService.loginUser(loginDto);

    // Check if 2FA is required
    if ('requires_2fa' in data && data.requires_2fa) {
      return handleSuccessOne({
        data,
        message: data.message,
        statusCode: 200,
      });
    }

    return handleSuccessOne({
      data,
      message: 'Login successful',
      statusCode: 200,
    });
  }

  @Post('customer/login')
  @ApiOperation({ summary: 'Customer login' })
  @ApiBody({
    description: 'Credentials for customer login',
    schema: ((): Record<string, unknown> => ({
      type: 'object',
      properties: {
        email: { type: 'string' },
        password: { type: 'string' },
      },
      example: AuthLoginCustomerRequestExample,
    }))(),
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: { example: AuthLoginCustomerResponseExample },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async loginCustomer(
    @Body(ValidationPipe) loginDto: CustomerLoginDto,
    @Req()
    req: {
      headers: Record<string, unknown>;
      ip?: string;
      connection?: { remoteAddress?: string };
    },
  ): Promise<IOneResponse<LoginResponseDto>> {
    console.log({ loginDto })
    const headers = req.headers || {};
    const userAgent = headers['user-agent'] as string | undefined;
    const forwarded = headers['x-forwarded-for'] as string | undefined;
    const ipHeader = forwarded ? forwarded.split(',')[0].trim() : undefined;
    const ip = ipHeader || req.ip || req.connection?.remoteAddress || undefined;
    const providedDeviceId = headers['x-device-id'] as string | undefined;
    const providedDeviceName = headers['x-device-name'] as string | undefined;
    const data = await this.authService.loginCustomer(loginDto, {
      userAgent,
      ipAddress: ip,
      providedDeviceId,
      providedDeviceName,
    });
    return handleSuccessOne({
      data,
      message: 'Login successful',
      statusCode: 200,
    });
  }

  @Post('customer/refresh')
  @ApiOperation({ summary: 'Rotate refresh token & issue new access token' })
  async refresh(
    @Body(ValidationPipe) dto: RefreshTokenDto,
  ): Promise<IOneResponse<any>> {
    const data = await this.authService.refreshCustomerToken(
      dto.session_id,
      dto.refresh_token,
    );
    return handleSuccessOne({
      data,
      message: 'Token refreshed',
      statusCode: 200,
    });
  }

  @Get('customer/sessions/:customerId')
  @ApiOperation({
    summary: 'List customer sessions (temporary - secure later)',
  })
  async listSessions(@Param('customerId') customerId: string) {
    const data = await this.authService.listCustomerSessions(customerId);
    return handleSuccessOne({
      data,
      message: 'Sessions fetched',
      statusCode: 200,
    });
  }

  @Post('customer/sessions/:customerId/revoke/:sessionId')
  @ApiOperation({
    summary: 'Revoke one session (temporary - secure later)',
  })
  async revokeSession(
    @Param('customerId') customerId: string,
    @Param('sessionId') sessionId: string,
  ) {
    const data = await this.authService.revokeCustomerSession(
      customerId,
      sessionId,
    );
    return handleSuccessOne({
      data,
      message: 'Session revoked',
      statusCode: 200,
    });
  }

  @Post('customer/sessions/:customerId/revoke-others/:currentSessionId')
  @ApiOperation({
    summary: 'Revoke other sessions except current (temporary)',
  })
  async revokeOthers(
    @Param('customerId') customerId: string,
    @Param('currentSessionId') currentSessionId: string,
  ) {
    const data = await this.authService.revokeOtherCustomerSessions(
      customerId,
      currentSessionId,
    );
    return handleSuccessOne({
      data,
      message: 'Other sessions revoked',
      statusCode: 200,
    });
  }

  @Post('customer/sessions/:customerId/revoke-all')
  @ApiOperation({ summary: 'Revoke all sessions (temporary)' })
  async revokeAll(@Param('customerId') customerId: string) {
    const data = await this.authService.revokeAllCustomerSessions(customerId);
    return handleSuccessOne({
      data,
      message: 'All sessions revoked',
      statusCode: 200,
    });
  }

  @Get('verify-token')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify admin/user token validity' })
  @ApiResponse({
    status: 200,
    description: 'Token is valid',
    schema: {
      example: {
        is_error: false,
        code: 'SUCCESS',
        message: 'Token is valid',
        data: {
          valid: true,
          user: {
            id: 'user-id',
            username: 'admin',
            roleId: 'role-id',
          },
        },
        status_code: 200,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Token is invalid or expired',
  })
  verifyToken(
    @Req()
    req: {
      user?: { sub: string; username: string; roleId: string; type: string };
    },
  ) {
    const user = req.user;
    return handleSuccessOne({
      data: {
        valid: true,
        user: {
          id: user?.sub || '',
          username: user?.username || '',
          roleId: user?.roleId || '',
          type: user?.type || '',
        },
      },
      message: 'Token is valid',
      statusCode: 200,
    });
  }

  @Post('logout')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout admin/user' })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
  })
  logout() {
    // For stateless JWT, we just return success
    // The frontend will clear the token
    // If you need to blacklist tokens, implement it in the service
    return handleSuccessOne({
      data: { success: true },
      message: 'Logout successful',
      statusCode: 200,
    });
  }

  // ============ Admin Profile Management ============

  @Get('profile')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current admin/user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getProfile(
    @Req()
    req: {
      user?: { sub: string; username: string; roleId: string; type: string };
    },
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    const data = await this.authService.getAdminProfile(userId);
    return handleSuccessOne({
      data,
      message: 'Profile retrieved successfully',
      statusCode: 200,
    });
  }

  @Patch('profile')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current admin/user profile' })
  @ApiBody({
    description: 'Profile update payload',
    schema: {
      type: 'object',
      properties: {
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        tel: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async updateProfile(
    @Req()
    req: {
      user?: { sub: string; username: string; roleId: string; type: string };
    },
    @Body(ValidationPipe) updateDto: UpdateProfileDto,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    const data = await this.authService.updateAdminProfile(userId, updateDto);
    return handleSuccessOne({
      data,
      message: 'Profile updated successfully',
      statusCode: 200,
    });
  }

  @Post('change-password')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change current admin/user password' })
  @ApiBody({
    description: 'Password change payload',
    schema: {
      type: 'object',
      properties: {
        current_password: { type: 'string' },
        new_password: { type: 'string' },
      },
      required: ['current_password', 'new_password'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Current password is incorrect or unauthorized',
  })
  async changePassword(
    @Req()
    req: {
      user?: { sub: string; username: string; roleId: string; type: string };
    },
    @Body(ValidationPipe) changeDto: ChangePasswordDto,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    const data = await this.authService.changeAdminPassword(
      userId,
      changeDto.current_password,
      changeDto.new_password,
    );
    return handleSuccessOne({
      data,
      message: 'Password changed successfully',
      statusCode: 200,
    });
  }

  // ============ Two-Factor Authentication ============

  @Post('2fa/setup')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set up 2FA for current admin/user' })
  @ApiResponse({
    status: 200,
    description: '2FA setup initiated, returns QR code and secret',
    schema: {
      example: {
        is_error: false,
        code: 'SUCCESS',
        message: '2FA setup initiated',
        data: {
          secret: 'ABCD1234EFGH5678',
          qrCode: 'data:image/png;base64,...',
          manualEntryKey: 'ABCD 1234 EFGH 5678',
        },
        status_code: 200,
      },
    },
  })
  @ApiResponse({ status: 400, description: '2FA is already enabled' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async setup2FA(
    @Req()
    req: {
      user?: { sub: string; username: string; roleId: string; type: string };
    },
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    const data = await this.twoFactorService.generateSecret(userId);
    return handleSuccessOne({
      data,
      message:
        '2FA setup initiated. Scan the QR code with your authenticator app.',
      statusCode: 200,
    });
  }

  @Post('2fa/enable')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify and enable 2FA' })
  @ApiBody({
    description: 'TOTP code from authenticator app',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string', example: '123456' },
      },
      required: ['code'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '2FA enabled successfully',
    schema: {
      example: {
        is_error: false,
        code: 'SUCCESS',
        message: '2FA has been enabled successfully',
        data: {
          enabled: true,
          backup_codes: ['ABCD1234', 'EFGH5678', '...'],
        },
        status_code: 200,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid verification code' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async enable2FA(
    @Req()
    req: {
      user?: { sub: string; username: string; roleId: string; type: string };
    },
    @Body(ValidationPipe) dto: Verify2FADto,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    const data = await this.twoFactorService.enableTwoFactor(userId, dto.code);
    return handleSuccessOne({
      data,
      message: data.message,
      statusCode: 200,
    });
  }

  @Post('2fa/disable')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable 2FA' })
  @ApiBody({
    description: 'Password and TOTP code or backup code to disable 2FA',
    schema: {
      type: 'object',
      properties: {
        password: { type: 'string' },
        code: { type: 'string', description: 'TOTP code from authenticator' },
        backup_code: { type: 'string', description: 'Or use a backup code' },
      },
      required: ['password'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '2FA disabled successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid code or 2FA not enabled' })
  @ApiResponse({ status: 401, description: 'Invalid password or unauthorized' })
  async disable2FA(
    @Req()
    req: {
      user?: { sub: string; username: string; roleId: string; type: string };
    },
    @Body(ValidationPipe) dto: Disable2FADto,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    const data = await this.twoFactorService.disableTwoFactor(
      userId,
      dto.password,
      dto.code,
      dto.backup_code,
    );
    return handleSuccessOne({
      data,
      message: data.message,
      statusCode: 200,
    });
  }

  @Get('2fa/status')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get 2FA status for current user' })
  @ApiResponse({
    status: 200,
    description: '2FA status',
    schema: {
      example: {
        is_error: false,
        code: 'SUCCESS',
        message: '2FA status retrieved',
        data: {
          enabled: true,
          backup_codes_remaining: 8,
        },
        status_code: 200,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async get2FAStatus(
    @Req()
    req: {
      user?: { sub: string; username: string; roleId: string; type: string };
    },
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    const data = await this.twoFactorService.getStatus(userId);
    return handleSuccessOne({
      data,
      message: '2FA status retrieved',
      statusCode: 200,
    });
  }

  @Post('2fa/regenerate-backup-codes')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Regenerate backup codes (requires TOTP verification)',
  })
  @ApiBody({
    description: 'Current TOTP code to verify before regenerating',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string', example: '123456' },
      },
      required: ['code'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Backup codes regenerated',
    schema: {
      example: {
        is_error: false,
        code: 'SUCCESS',
        message: 'Backup codes regenerated',
        data: {
          backup_codes: ['ABCD1234', 'EFGH5678', '...'],
        },
        status_code: 200,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid code or 2FA not enabled' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async regenerateBackupCodes(
    @Req()
    req: {
      user?: { sub: string; username: string; roleId: string; type: string };
    },
    @Body(ValidationPipe) dto: Regenerate2FADto,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    const data = await this.twoFactorService.regenerateBackupCodes(
      userId,
      dto.code,
    );
    return handleSuccessOne({
      data,
      message: data.message,
      statusCode: 200,
    });
  }

  @Post('2fa/verify')
  @ApiOperation({ summary: 'Complete login with 2FA code' })
  @ApiBody({
    description: 'Temp token and 2FA code to complete login',
    schema: {
      type: 'object',
      properties: {
        temp_token: { type: 'string' },
        code: { type: 'string', description: 'TOTP code from authenticator' },
        backup_code: { type: 'string', description: 'Or use a backup code' },
      },
      required: ['temp_token'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Login completed with 2FA',
    schema: {
      example: {
        is_error: false,
        code: 'SUCCESS',
        message: 'Login successful',
        data: {
          access_token: 'jwt-token',
          user: { id: 'user-id', username: 'admin' },
        },
        status_code: 200,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid code' })
  @ApiResponse({ status: 401, description: 'Invalid or expired temp token' })
  async verify2FALogin(@Body(ValidationPipe) dto: LoginWith2FADto) {
    const data = await this.authService.verifyTwoFactorLogin(
      dto.temp_token,
      dto.code,
      dto.backup_code,
    );
    return handleSuccessOne({
      data,
      message: 'Login successful',
      statusCode: 200,
    });
  }
}
