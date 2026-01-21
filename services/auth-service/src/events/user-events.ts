/**
 * Domain Events for Authentication Service
 */

export interface UserRegisteredEvent {
  eventType: 'UserRegistered';
  userId: string;
  email: string;
  role: string;
  timestamp: Date;
}

export interface UserLoggedInEvent {
  eventType: 'UserLoggedIn';
  userId: string;
  timestamp: Date;
}

export interface UserLoggedOutEvent {
  eventType: 'UserLoggedOut';
  userId: string;
  sessionId: string;
  timestamp: Date;
}

export interface PasswordResetRequestedEvent {
  eventType: 'PasswordResetRequested';
  userId: string;
  email: string;
  timestamp: Date;
}

