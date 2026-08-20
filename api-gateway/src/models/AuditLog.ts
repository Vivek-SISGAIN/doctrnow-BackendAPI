import mongoose, { Schema, Document } from 'mongoose';

export interface AuditEvent {
  eventId: string;
  timestamp: string;
  service: string;
  action: string;
  method?: string;
  path?: string;
  fullUrl?: string;
  statusCode?: number;
  userId?: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
  requestBody?: any;
  responseTimeMs?: number;
  errorMessage?: string;
  metadata?: Record<string, any>;

  // Structured Business Audit Trail fields
  hospitalId?: string;
  entityType?: 'DOCTOR' | 'PATIENT' | 'APPOINTMENT' | 'HOSPITAL' | string;
  actionPerformed?: string;
  actionType?: 'WORKFLOW' | 'DATA_CHANGE' | 'SYSTEM';
  performedByUserId?: string;
  performedByRole?: string;
  previousValue?: Record<string, any> | null;
  newValue?: Record<string, any> | null;
  statusChange?: { from: string | null; to: string | null } | null;
  remarks?: string | null;
}

export interface AuditLogDocument extends AuditEvent, Document {}

const AuditLogSchema: Schema = new Schema({
  eventId: { type: String, required: true, unique: true },
  timestamp: { type: String, required: true, index: true },
  service: { type: String, required: true, default: 'api-gateway' },
  action: { type: String, required: true },
  method: { type: String },
  path: { type: String, index: true },
  fullUrl: { type: String },
  statusCode: { type: Number, index: true },
  userId: { type: String, index: true },
  userRole: { type: String },
  ipAddress: { type: String },
  userAgent: { type: String },
  requestBody: { type: Schema.Types.Mixed },
  responseTimeMs: { type: Number },
  errorMessage: { type: String },
  metadata: { type: Schema.Types.Mixed },

  // Structured Business Audit Trail fields
  hospitalId: { type: String, index: true },
  entityType: { type: String, index: true },
  actionPerformed: { type: String },
  actionType: { type: String, enum: ['WORKFLOW', 'DATA_CHANGE', 'SYSTEM'], index: true },
  performedByUserId: { type: String, index: true },
  performedByRole: { type: String },
  previousValue: { type: Schema.Types.Mixed, default: null },
  newValue: { type: Schema.Types.Mixed, default: null },
  statusChange: {
    from: { type: String, default: null },
    to: { type: String, default: null },
  },
  remarks: { type: String, default: null },
}, { strict: false });

AuditLogSchema.index({ hospitalId: 1, timestamp: -1 });
AuditLogSchema.index({ hospitalId: 1, entityType: 1, timestamp: -1 });
AuditLogSchema.index({ actionType: 1, timestamp: -1 });
AuditLogSchema.index({ actionType: 1, timestamp: -1 });
AuditLogSchema.index({ performedByUserId: 1, timestamp: -1 });

AuditLogSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret.eventId ?? ret._id?.toString?.();
    delete ret._id;
    return ret;
  },
});

AuditLogSchema.set('toObject', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret.eventId ?? ret._id?.toString?.();
    delete ret._id;
    return ret;
  },
});

export const AuditLog =
  (mongoose.models.AuditLog as mongoose.Model<AuditLogDocument>) ||
  mongoose.model<AuditLogDocument>('AuditLog', AuditLogSchema);
