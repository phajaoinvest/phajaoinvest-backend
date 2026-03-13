import {
  NotificationPayload,
  NotificationCategory,
  NotificationAction,
  NotificationRecipientType,
} from '../interfaces/notification.interface';

/**
 * Notification Builder Helpers - Type-safe notification creation utilities
 *
 * These helpers ensure all routes create notifications with consistent formatting
 * and proper type safety (no `any` types).
 */

interface CustomerInfo {
  customerId: string;
  customerName?: string;
  customerEmail?: string;
}

interface AdminInfo {
  adminId: string;
  adminName?: string;
}

/**
 * Helper: Premium Membership Application Notification (Customer -> Admin)
 */
export function buildPremiumMembershipApplicationNotification(
  customer: CustomerInfo,
  paymentId: string,
  amount: number,
): NotificationPayload {
  return {
    category: NotificationCategory.PREMIUM_MEMBERSHIP,
    action: NotificationAction.APPLIED,
    recipientType: NotificationRecipientType.ADMIN,
    recipientId: 'admin',
    title: 'New Premium Membership Application',
    message: `${customer.customerName || 'Customer'} applied for premium membership`,
    metadata: {
      entityId: paymentId,
      entityType: 'payment',
      customerName: customer.customerName,
      customerEmail: customer.customerEmail,
      amount,
      serviceType: 'premium_membership',
      status: 'pending',
    },
    createdBy: customer.customerId,
  };
}

/**
 * Helper: Premium Membership Approval Notification (Admin -> Customer)
 */
export function buildPremiumMembershipApprovalNotification(
  customer: CustomerInfo,
  admin: AdminInfo,
  paymentId: string,
  approved: boolean,
  reason?: string,
): NotificationPayload {
  return {
    category: NotificationCategory.PREMIUM_MEMBERSHIP,
    action: approved
      ? NotificationAction.APPROVED
      : NotificationAction.REJECTED,
    recipientType: NotificationRecipientType.CUSTOMER,
    recipientId: customer.customerId,
    title: approved
      ? 'Premium Membership Approved'
      : 'Premium Membership Rejected',
    message: approved
      ? 'Your premium membership application has been approved'
      : `Your premium membership application was rejected${reason ? `: ${reason}` : ''}`,
    metadata: {
      entityId: paymentId,
      entityType: 'payment',
      adminName: admin.adminName,
      status: approved ? 'approved' : 'rejected',
      reason,
    },
    createdBy: admin.adminId,
  };
}

/**
 * Helper: International Stock Account Application Notification (Customer -> Admin)
 */
export function buildStockAccountApplicationNotification(
  customer: CustomerInfo,
  serviceId: string,
): NotificationPayload {
  return {
    category: NotificationCategory.INTERNATIONAL_STOCK_ACCOUNT,
    action: NotificationAction.APPLIED,
    recipientType: NotificationRecipientType.ADMIN,
    recipientId: 'admin',
    title: 'New Stock Account Application',
    message: `${customer.customerName || 'Customer'} applied for international stock account`,
    metadata: {
      entityId: serviceId,
      entityType: 'service',
      customerName: customer.customerName,
      customerEmail: customer.customerEmail,
      serviceType: 'international_stock_account',
      status: 'pending',
    },
    createdBy: customer.customerId,
  };
}

/**
 * Helper: Stock Account Approval Notification (Admin -> Customer)
 */
export function buildStockAccountApprovalNotification(
  customer: CustomerInfo,
  admin: AdminInfo,
  serviceId: string,
  approved: boolean,
  reason?: string,
): NotificationPayload {
  return {
    category: NotificationCategory.INTERNATIONAL_STOCK_ACCOUNT,
    action: approved
      ? NotificationAction.APPROVED
      : NotificationAction.REJECTED,
    recipientType: NotificationRecipientType.CUSTOMER,
    recipientId: customer.customerId,
    title: approved ? 'Stock Account Approved' : 'Stock Account Rejected',
    message: approved
      ? 'Your international stock account application has been approved'
      : `Your stock account application was rejected${reason ? `: ${reason}` : ''}`,
    metadata: {
      entityId: serviceId,
      entityType: 'service',
      adminName: admin.adminName,
      status: approved ? 'approved' : 'rejected',
      reason,
    },
    createdBy: admin.adminId,
  };
}

/**
 * Helper: Guaranteed Returns Application Notification (Customer -> Admin)
 */
export function buildGuaranteedReturnsApplicationNotification(
  customer: CustomerInfo,
  serviceId: string,
): NotificationPayload {
  return {
    category: NotificationCategory.GUARANTEED_RETURNS,
    action: NotificationAction.APPLIED,
    recipientType: NotificationRecipientType.ADMIN,
    recipientId: 'admin',
    title: 'New Guaranteed Returns Application',
    message: `${customer.customerName || 'Customer'} applied for guaranteed returns`,
    metadata: {
      entityId: serviceId,
      entityType: 'service',
      customerName: customer.customerName,
      customerEmail: customer.customerEmail,
      serviceType: 'guaranteed_returns',
      status: 'pending',
    },
    createdBy: customer.customerId,
  };
}

/**
 * Helper: Guaranteed Returns Approval Notification (Admin -> Customer)
 */
export function buildGuaranteedReturnsApprovalNotification(
  customer: CustomerInfo,
  admin: AdminInfo,
  serviceId: string,
  approved: boolean,
  reason?: string,
): NotificationPayload {
  return {
    category: NotificationCategory.GUARANTEED_RETURNS,
    action: approved
      ? NotificationAction.APPROVED
      : NotificationAction.REJECTED,
    recipientType: NotificationRecipientType.CUSTOMER,
    recipientId: customer.customerId,
    title: approved
      ? 'Guaranteed Returns Approved'
      : 'Guaranteed Returns Rejected',
    message: approved
      ? 'Your guaranteed returns application has been approved'
      : `Your guaranteed returns application was rejected${reason ? `: ${reason}` : ''}`,
    metadata: {
      entityId: serviceId,
      entityType: 'service',
      adminName: admin.adminName,
      status: approved ? 'approved' : 'rejected',
      reason,
    },
    createdBy: admin.adminId,
  };
}

/**
 * Helper: Stock Pick Payment Slip Submission Notification (Customer -> Admin)
 */
export function buildStockPickPaymentNotification(
  customer: CustomerInfo,
  customerPickId: string,
  stockSymbol: string,
  amount: number,
): NotificationPayload {
  return {
    category: NotificationCategory.STOCK_PICK_PAYMENT,
    action: NotificationAction.SUBMITTED,
    recipientType: NotificationRecipientType.ADMIN,
    recipientId: 'admin',
    title: 'Stock Pick Payment Slip Submitted',
    message: `${customer.customerName || 'Customer'} submitted payment slip for ${stockSymbol}`,
    metadata: {
      entityId: customerPickId,
      entityType: 'customer-stock-pick',
      stockSymbol,
      customerName: customer.customerName,
      customerEmail: customer.customerEmail,
      amount,
      status: 'pending',
    },
    createdBy: customer.customerId,
  };
}

/**
 * Helper: Stock Pick Approval Notification (Admin -> Customer)
 */
export function buildStockPickApprovalNotification(
  customer: CustomerInfo,
  admin: AdminInfo,
  customerPickId: string,
  stockSymbol: string,
  approved: boolean,
  reason?: string,
): NotificationPayload {
  return {
    category: NotificationCategory.STOCK_PICK_PAYMENT,
    action: approved
      ? NotificationAction.APPROVED
      : NotificationAction.REJECTED,
    recipientType: NotificationRecipientType.CUSTOMER,
    recipientId: customer.customerId,
    title: approved ? 'Stock Pick Approved' : 'Stock Pick Rejected',
    message: approved
      ? `Your stock pick ${stockSymbol} has been approved`
      : `Your stock pick ${stockSymbol} was rejected${reason ? `: ${reason}` : ''}`,
    metadata: {
      entityId: customerPickId,
      entityType: 'customer-stock-pick',
      stockSymbol,
      adminName: admin.adminName,
      status: approved ? 'approved' : 'rejected',
      reason,
    },
    createdBy: admin.adminId,
  };
}

/**
 * Helper: Top-up Request Notification (Customer -> Admin)
 */
export function buildTopUpNotification(
  customer: CustomerInfo,
  transferId: string,
  amount: number,
): NotificationPayload {
  return {
    category: NotificationCategory.TOP_UP,
    action: NotificationAction.SUBMITTED,
    recipientType: NotificationRecipientType.ADMIN,
    recipientId: 'admin',
    title: 'Account Top-up Request',
    message: `${customer.customerName || 'Customer'} submitted a top-up request`,
    metadata: {
      entityId: transferId,
      entityType: 'transfer',
      customerName: customer.customerName,
      customerEmail: customer.customerEmail,
      amount,
      status: 'pending',
    },
    createdBy: customer.customerId,
  };
}

/**
 * Helper: Top-up Approval Notification (Admin -> Customer)
 */
export function buildTopUpApprovalNotification(
  customer: CustomerInfo,
  admin: AdminInfo,
  transferId: string,
  amount: number,
  approved: boolean,
  reason?: string,
): NotificationPayload {
  return {
    category: NotificationCategory.TOP_UP,
    action: approved
      ? NotificationAction.APPROVED
      : NotificationAction.REJECTED,
    recipientType: NotificationRecipientType.CUSTOMER,
    recipientId: customer.customerId,
    title: approved ? 'Top-up Approved' : 'Top-up Rejected',
    message: approved
      ? `Your top-up of ${amount} has been approved`
      : `Your top-up request was rejected${reason ? `: ${reason}` : ''}`,
    metadata: {
      entityId: transferId,
      entityType: 'transfer',
      adminName: admin.adminName,
      amount,
      status: approved ? 'approved' : 'rejected',
      reason,
    },
    createdBy: admin.adminId,
  };
}

/**
 * Helper: Investment Request Notification (Customer -> Admin)
 */
export function buildInvestmentRequestNotification(
  customer: CustomerInfo,
  requestId: string,
  amount: number,
): NotificationPayload {
  return {
    category: NotificationCategory.INVESTMENT_REQUEST,
    action: NotificationAction.SUBMITTED,
    recipientType: NotificationRecipientType.ADMIN,
    recipientId: 'admin',
    title: 'New Investment Request',
    message: `${customer.customerName || 'Customer'} submitted an investment request`,
    metadata: {
      entityId: requestId,
      entityType: 'investment',
      customerName: customer.customerName,
      customerEmail: customer.customerEmail,
      amount,
      status: 'pending',
    },
    createdBy: customer.customerId,
  };
}

/**
 * Helper: Investment Approval Notification (Admin -> Customer)
 */
export function buildInvestmentApprovalNotification(
  customer: CustomerInfo,
  admin: AdminInfo,
  requestId: string,
  amount: number,
  approved: boolean,
  reason?: string,
): NotificationPayload {
  return {
    category: NotificationCategory.INVESTMENT_REQUEST,
    action: approved
      ? NotificationAction.APPROVED
      : NotificationAction.REJECTED,
    recipientType: NotificationRecipientType.CUSTOMER,
    recipientId: customer.customerId,
    title: approved ? 'Investment Approved' : 'Investment Rejected',
    message: approved
      ? `Your investment of ${amount} has been approved`
      : `Your investment request was rejected${reason ? `: ${reason}` : ''}`,
    metadata: {
      entityId: requestId,
      entityType: 'investment',
      adminName: admin.adminName,
      amount,
      status: approved ? 'approved' : 'rejected',
      reason,
    },
    createdBy: admin.adminId,
  };
}

/**
 * Helper: Investment Return Request Notification (Customer -> Admin)
 */
export function buildInvestmentReturnNotification(
  customer: CustomerInfo,
  returnId: string,
  amount: number,
): NotificationPayload {
  return {
    category: NotificationCategory.INVESTMENT_RETURN,
    action: NotificationAction.SUBMITTED,
    recipientType: NotificationRecipientType.ADMIN,
    recipientId: 'admin',
    title: 'Investment Return Request',
    message: `${customer.customerName || 'Customer'} requested investment return`,
    metadata: {
      entityId: returnId,
      entityType: 'investment-return',
      customerName: customer.customerName,
      customerEmail: customer.customerEmail,
      amount,
      status: 'pending',
    },
    createdBy: customer.customerId,
  };
}

/**
 * Helper: Investment Return Approval Notification (Admin -> Customer)
 */
export function buildInvestmentReturnApprovalNotification(
  customer: CustomerInfo,
  admin: AdminInfo,
  returnId: string,
  amount: number,
  approved: boolean,
  reason?: string,
): NotificationPayload {
  return {
    category: NotificationCategory.INVESTMENT_RETURN,
    action: approved
      ? NotificationAction.APPROVED
      : NotificationAction.REJECTED,
    recipientType: NotificationRecipientType.CUSTOMER,
    recipientId: customer.customerId,
    title: approved ? 'Return Request Approved' : 'Return Request Rejected',
    message: approved
      ? `Your return request of ${amount} has been approved`
      : `Your return request was rejected${reason ? `: ${reason}` : ''}`,
    metadata: {
      entityId: returnId,
      entityType: 'investment-return',
      adminName: admin.adminName,
      amount,
      status: approved ? 'approved' : 'rejected',
      reason,
    },
  };
}

/**
 * Helper: New Customer Registration Notification (Customer -> Admin)
 */
export function buildCustomerRegistrationNotification(
  customer: CustomerInfo,
): NotificationPayload {
  return {
    category: NotificationCategory.SYSTEM,
    action: NotificationAction.CREATED,
    recipientType: NotificationRecipientType.ADMIN,
    recipientId: 'admin',
    title: 'New Customer Registered',
    message: `A new customer ${customer.customerName || customer.customerEmail} has registered`,
    metadata: {
      entityId: customer.customerId,
      entityType: 'customer',
      customerName: customer.customerName,
      customerEmail: customer.customerEmail,
      status: 'active',
    },
    createdBy: customer.customerId,
  };
}

/**
 * Helper: Coupon Redemption Notification (Customer -> Admin)
 */
export function buildCouponRedemptionNotification(
  customer: CustomerInfo,
  code: string,
  durationMonths: number,
): NotificationPayload {
  return {
    category: NotificationCategory.SYSTEM,
    action: NotificationAction.CREATED,
    recipientType: NotificationRecipientType.ADMIN,
    recipientId: 'admin',
    title: 'Coupon Redeemed',
    message: `${customer.customerName || 'Customer'} redeemed a coupon code: ${code}`,
    metadata: {
      entityId: code,
      entityType: 'coupon',
      customerName: customer.customerName,
      customerEmail: customer.customerEmail,
      status: 'active',
      reason: `Granted ${durationMonths} months of Premium Membership`,
    },
    createdBy: customer.customerId,
  };
}

/**
 * Helper: Payment Slip Submission Notification (Customer -> Admin)
 */
export function buildPaymentSlipSubmissionNotification(
  customer: CustomerInfo,
  paymentId: string,
  amount: number,
  serviceType: string,
): NotificationPayload {
  return {
    category: NotificationCategory.SYSTEM,
    action: NotificationAction.SUBMITTED,
    recipientType: NotificationRecipientType.ADMIN,
    recipientId: 'admin',
    title: 'Payment Slip Submitted',
    message: `${customer.customerName || 'Customer'} submitted a payment slip for ${serviceType}`,
    metadata: {
      entityId: paymentId,
      entityType: 'payment',
      customerName: customer.customerName,
      customerEmail: customer.customerEmail,
      amount,
      serviceType,
      status: 'pending',
    },
    createdBy: customer.customerId,
  };
}

/**
 * Helper: Return Request Notification (Customer -> Admin)
 */
export function buildReturnRequestNotification(
  customer: CustomerInfo,
  transactionId: string,
  amount: number,
  type: string,
): NotificationPayload {
  return {
    category: NotificationCategory.SYSTEM,
    action: NotificationAction.SUBMITTED,
    recipientType: NotificationRecipientType.ADMIN,
    recipientId: 'admin',
    title: 'New Return Request',
    message: `${customer.customerName || 'Customer'} requested a return of ${type}`,
    metadata: {
      entityId: transactionId,
      entityType: 'investment_transaction',
      customerName: customer.customerName,
      customerEmail: customer.customerEmail,
      amount,
      returnType: type,
      status: 'pending',
    },
    createdBy: customer.customerId,
  };
}

/**
 * Helper: Return Approval Notification (Admin -> Customer)
 */
export function buildReturnApprovalNotification(
  customer: CustomerInfo,
  admin: AdminInfo,
  transactionId: string,
  amount: number,
  approved: boolean,
  reason?: string,
): NotificationPayload {
  return {
    category: NotificationCategory.SYSTEM,
    action: approved ? NotificationAction.APPROVED : NotificationAction.REJECTED,
    recipientType: NotificationRecipientType.CUSTOMER,
    recipientId: customer.customerId,
    title: approved ? 'Return Request Approved' : 'Return Request Rejected',
    message: approved
      ? `Your return request for $${amount} has been approved.`
      : `Your return request for $${amount} has been rejected. Reason: ${reason || 'Not specified'}`,
    metadata: {
      entityId: transactionId,
      entityType: 'investment_transaction',
      adminName: admin.adminName,
      amount,
      status: approved ? 'approved' : 'rejected',
      reason,
    },
    createdBy: admin.adminId,
  };
}
