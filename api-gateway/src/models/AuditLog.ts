import mongoose, { Schema, Document } from 'mongoose';

export interface AuditEvent {
  eventId: string;
  timestamp: string;
  service: string;
  action: string;
  method: string;
  path: string;
  fullUrl: string;
  statusCode?: number;
  userId?: string;
  userRole?: string;
  ipAddress: string;
  userAgent?: string;
  requestBody?: any;
  responseTimeMs?: number;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface AuditLogDocument extends AuditEvent, Document {}

const AuditLogSchema: Schema = new Schema({
  eventId: { type: String, required: true },
  timestamp: { type: String, required: true, index: true },
  service: { type: String, required: true, default: 'api-gateway' },
  action: { type: String, required: true },
  method: { type: String, required: true },
  path: { type: String, required: true, index: true },
  fullUrl: { type: String, required: true },
  statusCode: { type: Number, index: true },
  userId: { type: String, index: true },
  userRole: { type: String },
  ipAddress: { type: String, required: true },
  userAgent: { type: String },
  requestBody: { type: Schema.Types.Mixed },
  responseTimeMs: { type: Number },
  errorMessage: { type: String },
  metadata: { type: Schema.Types.Mixed },
});

export const AuditLog = mongoose.model<AuditLogDocument>('AuditLog', AuditLogSchema);
