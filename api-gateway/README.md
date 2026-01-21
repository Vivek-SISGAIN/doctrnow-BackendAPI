# API Gateway

Central entry point for all client requests. Handles routing, authentication, rate limiting, and API versioning.

## Features

- JWT validation
- OAuth2 support
- Rate limiting per user/IP
- API versioning (v1, v2, etc.)
- Request/Response logging
- CORS handling
- Request transformation

## Routes

All services are accessed through the gateway:
- `/api/v1/auth/*` → Authentication Service
- `/api/v1/profile/*` → Profile Service
- `/api/v1/appointments/*` → Appointment Service
- `/api/v1/consultations/*` → Consultation Service
- `/api/v1/video/*` → Video & Chat Service
- `/api/v1/payments/*` → Payment Service
- `/api/v1/prescriptions/*` → Medical Records Service
- `/api/v1/notifications/*` → Notification Service
- `/api/v1/hospital/*` → Hospital Admin Service
- `/api/v1/admin/*` → Super Admin Service
- `/api/v1/audit/*` → Audit Service

## Configuration

See `openapi.yaml` for API specifications.

