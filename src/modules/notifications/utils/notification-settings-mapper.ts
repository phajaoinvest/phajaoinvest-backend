import { NotificationCategory } from '../interfaces/notification.interface';

/**
 * Notification Settings Mapper
 *
 * Maps notification categories to user settings fields.
 * This ensures notifications are only sent to admins who have
 * the corresponding notification type enabled in their settings.
 */

/**
 * User notification setting keys as stored in user_settings table
 */
export type NotificationSettingKey =
  | 'notify_new_customers'
  | 'notify_payments'
  | 'notify_investments'
  | 'notify_stock_activity'
  | 'notify_system_alerts';

/**
 * Maps a NotificationCategory to the corresponding user setting field
 *
 * @param category - The notification category
 * @returns The user setting key that controls this notification type
 */
export function getSettingKeyForCategory(
  category: NotificationCategory,
): NotificationSettingKey {
  switch (category) {
    // Payment-related notifications
    case NotificationCategory.PREMIUM_MEMBERSHIP:
      return 'notify_payments';
    case NotificationCategory.TOP_UP:
      return 'notify_payments';

    // Investment-related notifications
    case NotificationCategory.GUARANTEED_RETURNS:
      return 'notify_investments';
    case NotificationCategory.INVESTMENT_REQUEST:
      return 'notify_investments';
    case NotificationCategory.INVESTMENT_RETURN:
      return 'notify_investments';

    // Stock activity notifications
    case NotificationCategory.STOCK_PICK_PAYMENT:
      return 'notify_stock_activity';
    case NotificationCategory.INTERNATIONAL_STOCK_ACCOUNT:
      return 'notify_stock_activity';

    // Default to system alerts for any unknown categories
    default:
      return 'notify_system_alerts';
  }
}

/**
 * Checks if a notification should be sent based on user settings
 *
 * @param category - The notification category
 * @param userSettings - The user's notification settings object
 * @returns boolean indicating if the notification should be sent
 */
export function shouldSendNotification(
  category: NotificationCategory,
  userSettings: {
    notify_new_customers?: boolean;
    notify_payments?: boolean;
    notify_investments?: boolean;
    notify_stock_activity?: boolean;
    notify_system_alerts?: boolean;
  },
): boolean {
  const settingKey = getSettingKeyForCategory(category);
  const settingValue = userSettings[settingKey];

  // Default to true if setting is not defined (backwards compatibility)
  return settingValue !== false;
}

/**
 * Describes what each notification category represents
 * (useful for documentation and UI)
 */
export const NotificationCategoryDescriptions: Record<
  NotificationCategory,
  {
    settingKey: NotificationSettingKey;
    description: string;
  }
> = {
  [NotificationCategory.PREMIUM_MEMBERSHIP]: {
    settingKey: 'notify_payments',
    description: 'Premium membership subscription payments',
  },
  [NotificationCategory.INTERNATIONAL_STOCK_ACCOUNT]: {
    settingKey: 'notify_stock_activity',
    description: 'International stock account applications',
  },
  [NotificationCategory.GUARANTEED_RETURNS]: {
    settingKey: 'notify_investments',
    description: 'Guaranteed returns service applications',
  },
  [NotificationCategory.STOCK_PICK_PAYMENT]: {
    settingKey: 'notify_stock_activity',
    description: 'Stock pick payment slip submissions',
  },
  [NotificationCategory.TOP_UP]: {
    settingKey: 'notify_payments',
    description: 'Account top-up requests',
  },
  [NotificationCategory.INVESTMENT_REQUEST]: {
    settingKey: 'notify_investments',
    description: 'New investment requests',
  },
  [NotificationCategory.INVESTMENT_RETURN]: {
    settingKey: 'notify_investments',
    description: 'Investment return requests',
  },
  [NotificationCategory.KYC]: {
    settingKey: 'notify_new_customers',
    description: 'Customer KYC verification',
  },
  [NotificationCategory.SYSTEM]: {
    settingKey: 'notify_system_alerts',
    description: 'System alerts and maintenance',
  },
};
