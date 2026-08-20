import { AuditLog, AuditEvent, AuditLogDocument } from '../models/AuditLog';
import { v4 as uuidv4 } from 'uuid';

const redactSensitiveData = (body: any): any => {
  if (!body) return body;
  
  if (typeof body !== 'object') {
    try {
      body = JSON.parse(body);
    } catch {
      return body;
    }
  }

  const sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'creditcard', 'cvv'];
  
  const redact = (obj: any): any => {
    if (Array.isArray(obj)) {
      return obj.map(redact);
    } else if (obj !== null && typeof obj === 'object') {
      const redactedObj: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
          redactedObj[key] = '[REDACTED]';
        } else {
          redactedObj[key] = typeof value === 'object' ? redact(value) : value;
        }
      }
      return redactedObj;
    }
    return obj;
  };

  return redact(body);
};

export const auditPublisher = async (event: Omit<AuditEvent, 'service'> & { service?: string }): Promise<void> => {
  try {
    const sanitizedBody = redactSensitiveData(event.requestBody);

    const auditEvent = new AuditLog({
      ...event,
      service: event.service || 'api-gateway',
      requestBody: sanitizedBody,
    });

    // Fire-and-forget
    auditEvent.save().catch(err => {
      console.error('Failed to save audit log to MongoDB asynchronously', err);
    });
  } catch (error) {
    // Never throw error in auditPublisher
    console.error('Error constructing or saving audit log:', error);
  }
};

export const publishBusinessAuditEvent = async (event: Partial<AuditEvent>): Promise<AuditLogDocument | null> => {
  try {
    const auditEvent = new AuditLog({
      eventId: event.eventId || uuidv4(),
      timestamp: event.timestamp || new Date().toISOString(),
      service: event.service || 'super-admin-service',
      action: event.actionPerformed || event.action || 'BUSINESS_EVENT',
      actionPerformed: event.actionPerformed,
      actionType: event.actionType || 'WORKFLOW',
      hospitalId: event.hospitalId,
      entityType: event.entityType,
      performedByUserId: event.performedByUserId || event.userId,
      performedByRole: event.performedByRole || event.userRole,
      userId: event.userId || event.performedByUserId,
      userRole: event.userRole || event.performedByRole,
      previousValue: event.previousValue ? redactSensitiveData(event.previousValue) : null,
      newValue: event.newValue ? redactSensitiveData(event.newValue) : null,
      statusChange: event.statusChange || null,
      remarks: event.remarks || null,
      ipAddress: event.ipAddress || 'internal',
      path: event.path || `/hospital/${event.hospitalId || 'audit'}`,
      method: event.method || 'POST',
      fullUrl: event.fullUrl || '',
      statusCode: event.statusCode || 200,
      metadata: event.metadata || {},
    });

    return await auditEvent.save();
  } catch (error) {
    console.error('Error saving business audit log:', error);
    return null;
  }
};
