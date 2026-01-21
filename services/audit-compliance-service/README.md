# Audit & Compliance Service

Tracks all system activities for audit and compliance purposes.

## Responsibilities

- Audit log recording
- Compliance reporting
- Access log tracking
- Data access auditing
- HIPAA/GDPR/PDPL compliance tracking
- Audit log retention

## Database Schema

```sql
audit_logs (
  id UUID PK,
  actor_id UUID,
  action VARCHAR,
  entity VARCHAR,
  entity_id UUID,
  changes JSONB,
  ip_address VARCHAR,
  user_agent TEXT,
  timestamp TIMESTAMP
)

compliance_reports (
  id UUID PK,
  report_type VARCHAR,
  period_start DATE,
  period_end DATE,
  generated_at TIMESTAMP,
  file_path TEXT
)
```

## API Endpoints

- `POST /audit/log` - Record audit event (internal)
- `GET /audit/logs` - Query audit logs (admin only)
- `GET /audit/logs/user/:userId` - Get user audit trail
- `GET /audit/logs/entity/:entityType/:entityId` - Get entity audit trail
- `POST /compliance/reports/generate` - Generate compliance report
- `GET /compliance/reports/:id` - Get compliance report

## Events Consumed

- All domain events from all services (for comprehensive audit trail)

## Compliance Standards

- HIPAA audit requirements
- GDPR right to access/erasure tracking
- UAE PDPL compliance
- DHA/MOHAP audit requirements

