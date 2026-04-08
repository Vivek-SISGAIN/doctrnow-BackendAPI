# Notification Service

Notification delivery service for EMAIL, SMS, PUSH, and IN_APP channels using RabbitMQ workers.

## API Endpoints

- `POST /api/notifications`
- `POST /api/devices`
- `POST /api/otp/send` (publishes OTP event to RabbitMQ)

## RabbitMQ Topology

- Main exchange: `notifications_exchange` (direct)
- Retry exchange: `notifications_retry_exchange` (direct)
- Channel queues:
  - `email.queue`
  - `sms.queue`
  - `push.queue`
  - `inapp.queue`
- OTP exchange: `auth_events_exchange` (topic, configurable via env)
- OTP queue: `auth.otp.sent.queue`
- OTP retry queue: `auth.otp.sent.retry.queue`

## OTP Event

Routing key: `auth.otp.sent`

Example payload:

```json
{
  "eventType": "OtpSent",
  "userId": "user-id",
  "channel": "EMAIL",
  "email": "user@example.com",
  "mobile": "+1234567890",
  "otp": "123456",
  "purpose": "LOGIN",
  "tenantId": "default",
  "timestamp": "2026-03-31T10:00:00.000Z"
}
```

Rules:

- `channel` must be `EMAIL` or `SMS`
- `otp` is required
- `email` is required when `channel=EMAIL`
- `mobile` is required when `channel=SMS`

## OTP Test

Publish sample OTP events:

```bash
npm run test:otp
```

