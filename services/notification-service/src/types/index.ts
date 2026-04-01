export type OtpChannel = "EMAIL" | "SMS";

export interface OtpEventPayload {
  eventType?: string;
  userId?: string;
  email?: string;
  mobile?: string;
  otp?: string;
  channel?: OtpChannel | string;
  purpose?: string;
  tenantId?: string;
  timestamp?: string;
  userName?: string;
}

export interface EventEnvelope<T> {
  data?: T;
}
