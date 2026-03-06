/**
 * Domain Events for Authentication Service
 * These events are published to Kafka for audit and compliance
 */

export interface UserRegisteredEvent {
  eventType: 'UserRegistered';
  userId: string;
  email: string;
  role: string;
  tenantId: string;
  timestamp: Date;
}

export interface LoginSucceededEvent {
  eventType: 'LoginSucceeded';
  userId: string;
  email: string;
  sessionId: string;
  tenantId: string;
  timestamp: Date;
}

export interface LoginFailedEvent {
  eventType: 'LoginFailed';
  email: string;
  userId?: string;
  reason: string;
  tenantId: string;
  timestamp: Date;
}

export interface OtpSentEvent {
  eventType: 'OtpSent';
  userId?: string;
  email?: string;
  mobile?: string;
  purpose: string;
  tenantId: string;
  timestamp: Date;
}

export interface OtpVerifiedEvent {
  eventType: 'OtpVerified';
  userId?: string;
  email?: string;
  mobile?: string;
  purpose: string;
  tenantId: string;
  timestamp: Date;
}

export interface SessionRevokedEvent {
  eventType: 'SessionRevoked';
  userId: string;
  sessionId: string;
  timestamp: Date;
}

export interface PasswordResetRequestedEvent {
  eventType: 'PasswordResetRequested';
  userId: string;
  email: string;
  tenantId: string;
  timestamp: Date;
}

export interface PasswordResetCompletedEvent {
  eventType: 'PasswordResetCompleted';
  userId: string;
  email: string;
  tenantId: string;
  timestamp: Date;
}

export interface AccountLockedEvent {
  eventType: 'AccountLocked';
  userId: string;
  email: string;
  tenantId: string;
  timestamp: Date;
}
