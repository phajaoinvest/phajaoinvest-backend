import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/notification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { handleSuccessOne } from '../../common/utils/response.util';
import type { JwtPayload } from '../../common/interfaces';

@ApiTags('admin-notifications')
@ApiBearerAuth()
@Controller('admin/notifications')
@UseGuards(JwtAuthGuard)
export class AdminNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get admin notifications with pagination' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Notifications retrieved' })
  async getMyNotifications(
    @AuthUser() user: JwtPayload,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    const recipientId = 'admin'; // Always admin for this controller

    // Get notifications with pagination
    const allNotifications =
      await this.notificationsService.getNotificationsByRecipient(recipientId);

    // Get count
    const count =
      await this.notificationsService.getNotificationCount(recipientId);

    // Apply pagination if provided
    const startIndex = skip ? Number(skip) : 0;
    const endIndex = take ? startIndex + Number(take) : allNotifications.length;
    const paginatedNotifications = allNotifications.slice(startIndex, endIndex);

    return handleSuccessOne({
      data: {
        notifications: paginatedNotifications,
        total: count.total,
        unreadCount: count.unread,
      },
      message: 'Notifications retrieved',
    });
  }

  @Get('unread')
  @ApiOperation({ summary: 'Get admin unread notifications' })
  @ApiResponse({ status: 200, description: 'Unread notifications retrieved' })
  async getUnreadNotifications(@AuthUser() user: JwtPayload) {
    const recipientId = 'admin'; // Always admin for this controller
    const notifications =
      await this.notificationsService.getUnreadNotifications(recipientId);

    return handleSuccessOne({
      data: notifications,
      message: 'Unread notifications retrieved',
    });
  }

  @Get('count')
  @ApiOperation({ summary: 'Get admin notification count' })
  @ApiResponse({ status: 200, description: 'Notification count retrieved' })
  async getNotificationCount(@AuthUser() user: JwtPayload) {
    const recipientId = 'admin'; // Always admin for this controller
    const count =
      await this.notificationsService.getNotificationCount(recipientId);

    return handleSuccessOne({
      data: count,
      message: 'Notification count retrieved',
    });
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark admin notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthUser() user: JwtPayload,
  ) {
    const recipientId = 'admin'; // Always admin for this controller
    const success = await this.notificationsService.markAsRead(recipientId, id);

    return handleSuccessOne({
      data: { success },
      message: success
        ? 'Notification marked as read'
        : 'Notification not found',
    });
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all admin notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllAsRead(@AuthUser() user: JwtPayload) {
    const recipientId = 'admin'; // Always admin for this controller
    const count = await this.notificationsService.markAllAsRead(recipientId);

    return handleSuccessOne({
      data: { count },
      message: `${count} notifications marked as read`,
    });
  }

  @Post('test')
  @ApiOperation({ summary: 'Create test notification (development only)' })
  @ApiResponse({ status: 200, description: 'Test notification created' })
  async createTestNotification(
    @Body(ValidationPipe) dto: CreateNotificationDto,
    @AuthUser() user: JwtPayload,
  ) {
    const notification = await this.notificationsService.createNotification({
      ...dto,
      createdBy: user.sub,
    });

    // Note: Socket.IO emission is now handled automatically inside createNotification

    return handleSuccessOne({
      data: notification,
      message: 'Test notification created',
    });
  }
}
