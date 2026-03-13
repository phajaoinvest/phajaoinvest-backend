/**
 * Notification Types - Fully type-safe, no `any` types
 */

export enum NotificationRecipientType {
  ADMIN = 'admin',
  CUSTOMER = 'customer',
}

export enum NotificationCategory {
  PREMIUM_MEMBERSHIP = 'premium_membership',
  INTERNATIONAL_STOCK_ACCOUNT = 'international_stock_account',
  GUARANTEED_RETURNS = 'guaranteed_returns',
  STOCK_PICK_PAYMENT = 'stock_pick_payment',
  TOP_UP = 'top_up',
  INVESTMENT_REQUEST = 'investment_request',
  INVESTMENT_RETURN = 'investment_return',
  KYC = 'kyc',
  SYSTEM = 'system',
}

export enum NotificationAction {
  APPLIED = 'applied',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUBMITTED = 'submitted',
  CREATED = 'created',
}

export interface NotificationPayload {
  category: NotificationCategory;
  action: NotificationAction;
  recipientType: NotificationRecipientType;
  recipientId: string; // customerId or 'admin'
  title: string;
  message: string;
  metadata: NotificationMetadata;
  createdBy?: string; // userId or customerId who triggered the action
}

export interface NotificationMetadata {
  entityId: string; // ID of the related entity (serviceId, paymentId, etc.)
  entityType: string; // 'service', 'payment', 'stock-pick', 'investment', etc.
  customerName?: string;
  customerEmail?: string;
  amount?: number;
  serviceType?: string;
  status?: string;
  adminName?: string;
  reason?: string;
  stockSymbol?: string;
  returnType?: string;
  customerId?: string;
  durationMonths?: number;
}

export interface NotificationResponse {
  id: string;
  category: NotificationCategory;
  action: NotificationAction;
  recipientType: NotificationRecipientType;
  recipientId: string;
  title: string;
  message: string;
  metadata: NotificationMetadata;
  isRead: boolean;
  createdAt: Date;
  readAt?: Date;
  createdBy?: string;
}
