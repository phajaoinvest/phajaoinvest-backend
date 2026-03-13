import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationPayload,
  NotificationResponse,
  NotificationRecipientType,
} from './interfaces/notification.interface';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { UserSettings } from '../settings/entities/user-settings.entity';
import {
  shouldSendNotification,
  getSettingKeyForCategory,
} from './utils/notification-settings-mapper';
import { MailService } from '../mail/mail.service';
import { Customer } from '../customers/entities/customer.entity';

interface INotificationsGateway {
  emitNotification(notification: NotificationResponse): void;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private gateway: INotificationsGateway | null = null; // Will be set by NotificationsGateway

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSettings)
    private readonly userSettingsRepository: Repository<UserSettings>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly mailService: MailService,
  ) { }

  setGateway(gateway: INotificationsGateway): void {
    this.gateway = gateway;
    this.logger.log('✅ Gateway instance registered with NotificationsService');
  }
  async createNotification(
    payload: NotificationPayload,
  ): Promise<NotificationResponse | null> {
    try {
      // For all notifications (including admin), proceed as a single record
      return this.createSingleNotification(payload);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.warn(
        `Failed to create notification: ${errorMessage}`,
        errorStack,
      );
      return null;
    }
  }

  private async createAdminNotificationWithPreferences(
    payload: NotificationPayload,
  ): Promise<NotificationResponse | null> {
    // Get all admin users
    const adminUsers = await this.userRepository.find({
      select: ['id', 'username'],
    });

    if (adminUsers.length === 0) {
      this.logger.warn('⚠️  No admin users found to send notification to');
      return null;
    }

    const settingKey = getSettingKeyForCategory(payload.category);
    this.logger.log(
      `📋 Notification category ${payload.category} maps to setting: ${settingKey}`,
    );

    let firstResponse: NotificationResponse | null = null;
    let sentCount = 0;

    // Create notification for each admin who has the setting enabled
    for (const admin of adminUsers) {
      // Get admin's notification settings
      let settings = await this.userSettingsRepository.findOne({
        where: { user_id: admin.id },
      });

      // If no settings exist, use defaults (all enabled)
      if (!settings) {
        settings = {
          notify_new_customers: true,
          notify_payments: true,
          notify_investments: true,
          notify_stock_activity: true,
          notify_system_alerts: true,
          notify_email: false,
        } as UserSettings;
      }

      // Check if this admin wants this type of notification
      if (!shouldSendNotification(payload.category, settings)) {
        this.logger.log(
          `⏭️  Skipping notification for admin ${admin.username} - ${settingKey} is disabled`,
        );
        continue;
      }

      // Create notification for this specific admin
      const adminPayload: NotificationPayload = {
        ...payload,
        recipientId: admin.id, // Use individual admin ID instead of 'admin'
      };

      // Skip email here because we'll send a single global admin notification email after the loop
      const response = await this.createSingleNotification(adminPayload, true);
      if (response) {
        sentCount++;
        if (!firstResponse) {
          firstResponse = response;
        }
      }
    }

    // Send a single notification email to the configured admin emails
    void this.triggerEmailNotification(payload);

    this.logger.log(
      `✅ Admin notification sent to ${sentCount}/${adminUsers.length} admins based on preferences`,
    );

    return firstResponse;
  }

  private async createSingleNotification(
    payload: NotificationPayload,
    skipEmail = false,
  ): Promise<NotificationResponse | null> {
    // PERFORMANCE: Extract indexed fields from metadata for fast querying
    const entityId = payload.metadata?.entityId;
    const entityType = payload.metadata?.entityType;

    // Determine if we can link this to a real customer UUID
    let customerId: string | null = null;
    if (payload.recipientType === NotificationRecipientType.CUSTOMER) {
      customerId = payload.recipientId;
    } else if (payload.metadata?.customerId) {
      // Sometimes we notify admins about a specific customer
      customerId = payload.metadata.customerId;
    }

    const notification = this.notificationRepository.create({
      category: payload.category,
      action: payload.action,
      recipientType: payload.recipientType,
      recipientId: payload.recipientId,
      entityId: entityId as string,
      entityType: entityType as string,
      customerId: customerId as string,
      title: payload.title,
      message: payload.message,
      metadata: payload.metadata as unknown as Record<string, unknown>,
      isRead: false,
      createdBy: payload.createdBy,
    });

    const savedNotification =
      await this.notificationRepository.save(notification);

    const response = this.mapToResponse(savedNotification);

    this.logger.log(
      `✅ Notification created: ${savedNotification.category}:${savedNotification.action} for ${savedNotification.recipientType}:${savedNotification.recipientId}`,
    );

    // TRIGGER EMAIL NOTIFICATION
    if (!skipEmail) {
      void this.triggerEmailNotification(payload);
    }

    // Emit real-time notification via Socket.IO (if gateway is available)
    if (this.gateway) {
      this.logger.log(
        `📡 Attempting to emit notification via Socket.IO to room: ${response.recipientId}`,
      );
      try {
        this.gateway.emitNotification(response);
        this.logger.log('✅ Socket.IO emission completed');
      } catch (emitError) {
        // Don't fail the entire operation if Socket.IO emission fails
        const errorMessage =
          emitError instanceof Error ? emitError.message : 'Unknown error';
        this.logger.error(
          `❌ Failed to emit notification via Socket.IO: ${errorMessage}`,
        );
      }
    } else {
      this.logger.warn(
        '⚠️  Gateway not available, notification not emitted via Socket.IO',
      );
    }

    return response;
  }

  /**
   * Get all notifications for a specific recipient
   */
  async getNotificationsByRecipient(
    recipientId: string,
  ): Promise<NotificationResponse[]> {
    const notifications = await this.notificationRepository.find({
      where: { recipientId },
      order: { createdAt: 'DESC' },
    });

    return notifications.map((n) => this.mapToResponse(n));
  }

  /**
   * Get unread notifications for a specific recipient
   */
  async getUnreadNotifications(
    recipientId: string,
  ): Promise<NotificationResponse[]> {
    const notifications = await this.notificationRepository.find({
      where: { recipientId, isRead: false },
      order: { createdAt: 'DESC' },
    });

    return notifications.map((n) => this.mapToResponse(n));
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(
    recipientId: string,
    notificationId: string,
  ): Promise<boolean> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, recipientId },
    });

    if (!notification) {
      return false;
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await this.notificationRepository.save(notification);

    return true;
  }

  /**
   * Mark all notifications as read for a recipient
   */
  async markAllAsRead(recipientId: string): Promise<number> {
    const result = await this.notificationRepository.update(
      { recipientId, isRead: false },
      { isRead: true, readAt: new Date() },
    );

    return result.affected || 0;
  }

  /**
   * Delete a notification
   */
  async deleteNotification(
    recipientId: string,
    notificationId: string,
  ): Promise<boolean> {
    const result = await this.notificationRepository.delete({
      id: notificationId,
      recipientId,
    });

    return (result.affected || 0) > 0;
  }

  /**
   * Clear all notifications for a recipient (useful for testing)
   */
  async clearNotifications(recipientId: string): Promise<void> {
    await this.notificationRepository.delete({ recipientId });
  }

  /**
   * Get notification count for a recipient
   */
  async getNotificationCount(recipientId: string): Promise<{
    total: number;
    unread: number;
  }> {
    const [total, unread] = await Promise.all([
      this.notificationRepository.count({ where: { recipientId } }),
      this.notificationRepository.count({
        where: { recipientId, isRead: false },
      }),
    ]);

    return { total, unread };
  }

  /**
   * Get a single notification by ID
   */
  async getNotificationById(
    notificationId: string,
  ): Promise<NotificationResponse> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException(
        `Notification with ID ${notificationId} not found`,
      );
    }

    return this.mapToResponse(notification);
  }

  /**
   * Handle triggering emails based on notification payload
   */
  private async triggerEmailNotification(payload: NotificationPayload): Promise<void> {
    try {
      if (payload.recipientType === NotificationRecipientType.ADMIN) {
        // Send email to all configured admins
        await this.mailService.sendAdminNotification(
          payload.title,
          payload.message,
          payload.metadata,
        );
      } else if (payload.recipientType === NotificationRecipientType.CUSTOMER) {
        // Fetch customer email
        const customer = await this.customerRepository.findOne({
          where: { id: payload.recipientId },
          select: ['email'],
        });

        if (customer?.email) {
          await this.mailService.sendCustomerNotification(
            customer.email,
            payload.title,
            payload.message,
            payload.metadata,
          );
        }
      }
    } catch (err) {
      this.logger.error('Failed to trigger email notification', err);
    }
  }

  /**
   * Map entity to response
   */
  private mapToResponse(notification: Notification): NotificationResponse {
    const metadata = notification.metadata || {};
    return {
      id: notification.id,
      category: notification.category,
      action: notification.action,
      recipientType: notification.recipientType,
      recipientId: notification.recipientId,
      title: notification.title,
      message: notification.message,
      metadata: {
        ...metadata,
        entityId: notification.entityId || (metadata.entityId as string) || '',
        entityType: notification.entityType || (metadata.entityType as string) || '',
        customerId: notification.customerId || (metadata.customerId as string) || undefined,
        customerName: metadata.customerName as string | undefined,
        customerEmail: metadata.customerEmail as string | undefined,
        amount: metadata.amount as number | undefined,
        serviceType: metadata.serviceType as string | undefined,
        status: metadata.status as string | undefined,
        adminName: metadata.adminName as string | undefined,
        reason: metadata.reason as string | undefined,
      },
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
      createdBy: notification.createdBy,
    };
  }
}
