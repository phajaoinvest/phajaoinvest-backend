export enum EmploymentStatus {
  EMPLOYED = 'employed',
  SELF_EMPLOYED = 'self_employed',
  UNEMPLOYED = 'unemployed',
  RETIRED = 'retired',
  STUDENT = 'student',
}

export enum MaritalStatus {
  SINGLE = 'single',
  MARRIED = 'married',
  DIVORCED = 'divorced',
  WIDOWED = 'widowed',
}
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

export enum CustomerStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

export enum RoleStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum PermissionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum TransferIdentify {
  RECHARGE = 'recharge',
  WITHDRAW = 'withdraw',
  CALL_PAYMENT = 'call_payment',
  VIDEO_PAYMENT = 'video_payment',
  CHAT_PAYMENT = 'chat_payment',
  INVEST = 'invest', // wallet -> service investment allocation
}

export enum TransferStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum WalletStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

export enum InvestTypeStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum BoundStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum StockTransactionType {
  BUY = 'buy',
  SELL = 'sell',
}

export enum AuditLogStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

export enum InvestmentInfoStatus {
  PENDING = 'pending',
  CANCELLED = 'cancelled',
  INVESTING = 'investing',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
}

export enum RiskTolerance {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum PaperTradeStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}
