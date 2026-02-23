import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  ValidationPipe,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import {
  UpdateNotificationSettingsDto,
  CreateSystemSettingDto,
  UpdateSystemSettingDto,
} from './dto/settings.dto';
import { JwtUserAuthGuard } from '../auth/guards/jwt-user.guard';
import {
  handleSuccessOne,
  handleSuccessMany,
} from '../../common/utils/response.util';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) { }

  // ============================================================================
  // User Notification Settings
  // ============================================================================

  @Get('notifications')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user notification settings' })
  @ApiResponse({
    status: 200,
    description: 'Notification settings retrieved',
  })
  async getNotificationSettings(@Req() req: { user?: { sub: string } }) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const data = await this.settingsService.getUserSettings(userId);
    return handleSuccessOne({
      data: {
        notify_new_customers: data.notify_new_customers,
        notify_payments: data.notify_payments,
        notify_investments: data.notify_investments,
        notify_stock_activity: data.notify_stock_activity,
        notify_system_alerts: data.notify_system_alerts,
        notify_email: data.notify_email,
      },
      message: 'Notification settings retrieved',
      statusCode: 200,
    });
  }

  @Patch('notifications')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user notification settings' })
  @ApiBody({ type: UpdateNotificationSettingsDto })
  @ApiResponse({
    status: 200,
    description: 'Notification settings updated',
  })
  async updateNotificationSettings(
    @Req() req: { user?: { sub: string } },
    @Body(ValidationPipe) updateDto: UpdateNotificationSettingsDto,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const data = await this.settingsService.updateUserSettings(
      userId,
      updateDto,
    );
    return handleSuccessOne({
      data: {
        notify_new_customers: data.notify_new_customers,
        notify_payments: data.notify_payments,
        notify_investments: data.notify_investments,
        notify_stock_activity: data.notify_stock_activity,
        notify_system_alerts: data.notify_system_alerts,
        notify_email: data.notify_email,
      },
      message: 'Notification settings updated',
      statusCode: 200,
    });
  }

  // ============================================================================
  // System Settings (Admin only)
  // ============================================================================

  @Get('system')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all system settings' })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter by category',
  })
  @ApiResponse({
    status: 200,
    description: 'System settings retrieved',
  })
  async getSystemSettings(@Query('category') category?: string) {
    const data = category
      ? await this.settingsService.getSystemSettingsByCategory(category)
      : await this.settingsService.getAllSystemSettings();

    return handleSuccessMany({
      data,
      message: 'System settings retrieved',
      statusCode: 200,
    });
  }

  @Get('system/:key')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a specific system setting by key' })
  @ApiParam({ name: 'key', description: 'Setting key' })
  @ApiResponse({
    status: 200,
    description: 'System setting retrieved',
  })
  async getSystemSetting(@Param('key') key: string) {
    const data = await this.settingsService.getSystemSetting(key);
    if (!data) {
      return handleSuccessOne({
        data: null,
        message: 'Setting not found',
        statusCode: 404,
      });
    }
    return handleSuccessOne({
      data,
      message: 'System setting retrieved',
      statusCode: 200,
    });
  }

  @Post('system')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new system setting' })
  @ApiBody({ type: CreateSystemSettingDto })
  @ApiResponse({
    status: 201,
    description: 'System setting created',
  })
  async createSystemSetting(
    @Body(ValidationPipe) createDto: CreateSystemSettingDto,
  ) {
    const data = await this.settingsService.createSystemSetting(createDto);
    return handleSuccessOne({
      data,
      message: 'System setting created',
      statusCode: 201,
    });
  }

  @Patch('system/:key')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a system setting value' })
  @ApiParam({ name: 'key', description: 'Setting key' })
  @ApiBody({ type: UpdateSystemSettingDto })
  @ApiResponse({
    status: 200,
    description: 'System setting updated',
  })
  async updateSystemSetting(
    @Param('key') key: string,
    @Body(ValidationPipe) updateDto: UpdateSystemSettingDto,
  ) {
    const data = await this.settingsService.updateSystemSetting(key, updateDto);
    return handleSuccessOne({
      data,
      message: 'System setting updated',
      statusCode: 200,
    });
  }

  @Delete('system/:key')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a system setting' })
  @ApiParam({ name: 'key', description: 'Setting key' })
  @ApiResponse({
    status: 200,
    description: 'System setting deleted',
  })
  async deleteSystemSetting(@Param('key') key: string) {
    await this.settingsService.deleteSystemSetting(key);
    return handleSuccessOne({
      data: { deleted: true },
      message: 'System setting deleted',
      statusCode: 200,
    });
  }

  // ============================================================================
  // Quick Actions
  // ============================================================================

  @Get('maintenance-mode')
  @ApiOperation({ summary: 'Check if maintenance mode is enabled (public)' })
  @ApiResponse({
    status: 200,
    description: 'Maintenance mode status',
  })
  async getMaintenanceMode() {
    const enabled = await this.settingsService.isMaintenanceMode();
    return handleSuccessOne({
      data: { maintenance_mode: enabled },
      message: 'Maintenance mode status retrieved',
      statusCode: 200,
    });
  }

  @Post('maintenance-mode')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle maintenance mode' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Maintenance mode updated',
  })
  async setMaintenanceMode(@Body('enabled') enabled: boolean) {
    const setting = await this.settingsService.setMaintenanceMode(enabled);
    return handleSuccessOne({
      data: { maintenance_mode: setting.value === 'true' },
      message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`,
      statusCode: 200,
    });
  }

  @Post('initialize')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initialize default system settings' })
  @ApiResponse({
    status: 200,
    description: 'Default settings initialized',
  })
  async initializeDefaults() {
    await this.settingsService.initializeDefaults();
    return handleSuccessOne({
      data: { initialized: true },
      message: 'Default settings initialized',
      statusCode: 200,
    });
  }

  @Get('database/backup/history')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get recent database backup history' })
  @ApiResponse({
    status: 200,
    description: 'Backup history retrieved',
  })
  async getBackupHistory() {
    const history = await this.settingsService.getBackupHistory();
    return handleSuccessMany({
      data: history,
      message: 'Backup history retrieved',
      statusCode: 200,
    });
  }

  @Post('database/backup')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trigger a manual database backup' })
  @ApiResponse({
    status: 200,
    description: 'Manual backup initiated',
  })
  async triggerBackup() {
    const backupResult = await this.settingsService.createManualBackup();
    return handleSuccessOne({
      data: backupResult,
      message: 'Backup process completed',
      statusCode: 200,
    });
  }

  @Get('database/backup/download/:fileName')
  @UseGuards(JwtUserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download a generated backup file' })
  @ApiParam({ name: 'fileName', description: 'Name of the backup file' })
  downloadBackup(@Param('fileName') fileName: string, @Res() res: Response) {
    // Basic path traversal prevention
    if (fileName.includes('..') || fileName.includes('/')) {
      throw new NotFoundException('Invalid file name');
    }
    const filePath = path.join(process.cwd(), 'backups', fileName);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Backup file not found');
    }
    res.download(filePath);
  }
}
