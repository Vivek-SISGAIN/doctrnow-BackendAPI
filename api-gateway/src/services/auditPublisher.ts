import { AuditLog, AuditEvent } from '../models/AuditLog';

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
