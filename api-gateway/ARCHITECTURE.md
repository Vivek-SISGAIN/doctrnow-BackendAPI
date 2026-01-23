# API Gateway Architecture

## Overview

The API Gateway serves as the **single external entry point** for all client requests to the DoctorNow platform. It implements a strict, security-first design with zero business logic and no database access.

## Architecture Principles

1. **Single Responsibility**: Route, authenticate, authorize, rate-limit, and proxy
2. **No Business Logic**: Pure pass-through with security enforcement
3. **No Data Access**: Zero database connections
4. **Audit-Safe**: No PHI in logs, correlation ID propagation
5. **Resilient**: Circuit breakers, timeouts, graceful degradation

## Request Flow

```
Client Request
    ↓
[NestJS API Gateway]
    ↓
1. Correlation ID Generation (Interceptor)
    ↓
2. Request Validation (Pipes)
    ↓
3. Rate Limiting (Guard - Redis-backed)
    ↓
4. JWT Authentication (Guard - RS256/JWKS)
    ↓
5. Token Revocation Check (Service - Redis)
    ↓
6. RBAC Authorization (Guard)
    ↓
7. Structured Logging (Interceptor - PHI-safe)
    ↓
8. Circuit Breaker Check (Interceptor)
    ↓
9. Service Proxy (HTTP Client with timeout/retry)
    ↓
10. Response Logging (Interceptor)
    ↓
Client Response
```

## Components

### Guards (Execution Order)

1. **RateLimitGuard** - Redis-backed per-user/IP limiting
2. **JwtAuthGuard** - RS256 token validation via JWKS
3. **RolesGuard** - RBAC authorization

### Interceptors

1. **CorrelationIdInterceptor** - Generates/propagates correlation IDs
2. **LoggingInterceptor** - Structured, PHI-safe logging
3. **CircuitBreakerInterceptor** - Downstream service protection
4. **TransformInterceptor** - Response standardization

### Services

1. **JwtService** - Token validation, JWKS key rotation
2. **TokenRevocationService** - Blacklist management (Redis)
3. **HttpProxyService** - Service routing with retry/timeout
4. **CircuitBreakerService** - State management

### Controllers

Explicit route controllers (NO generic proxy):
- `AuthController` → `/api/v1/auth/*` → auth-service
- `ProfileController` → `/api/v1/profiles/*` → profile-service
- `AppointmentController` → `/api/v1/appointments/*` → appointment-service
- `ConsultationController` → `/api/v1/consultations/*` → consultation-service

## Security Model

### JWT Authentication

- **Algorithm**: RS256 (asymmetric)
- **Key Source**: JWKS endpoint (auth-service)
- **Validation**: issuer, audience, expiration
- **Revocation**: Redis blacklist check
- **Rotation**: Automatic JWKS cache refresh

### RBAC Authorization

- **Roles**: PATIENT, DOCTOR, HOSPITAL_ADMIN, SUPER_ADMIN
- **Enforcement**: Route-level via `@Roles()` decorator
- **Tenant Isolation**: Multi-tenant via `x-tenant-id` header

### Rate Limiting

- **Storage**: Redis (distributed)
- **Strategies**:
  - Global: 100 req/15min per IP
  - Auth endpoints: 5 req/15min per IP
  - Authenticated: 200 req/15min per user
- **Headers**: Standard rate-limit headers

## Compliance & Audit

### PHI Handling

- **Never logged**: Patient names, IDs, medical data
- **Logged**: User IDs (hashed), endpoints, timestamps, status codes
- **Correlation IDs**: Propagated to all services

### Audit Trail

- All authentication attempts
- Authorization failures
- Rate limit violations
- Service unavailability events

## Resilience

### Circuit Breaker

- **Threshold**: 50% error rate
- **Timeout**: 3 seconds
- **Reset**: 30 seconds
- **Fallback**: 503 Service Unavailable

### Retry Policy

- **Max Retries**: 2
- **Backoff**: Exponential (100ms, 200ms)
- **Conditions**: Only for 5xx errors, network timeouts

## Observability

### Logging

- **Format**: JSON (production), structured (development)
- **Levels**: ERROR, WARN, INFO, DEBUG
- **Destination**: Console, file, centralized logging service
- **Fields**: Correlation ID, user ID (hashed), endpoint, status, duration

### Metrics

- Request rates per endpoint
- Error rates per service
- Circuit breaker state
- Rate limit hits
- Authentication failures

## Folder Structure

```
api-gateway/
├── src/
│   ├── main.ts                 # Bootstrap
│   ├── app.module.ts           # Root module
│   ├── common/
│   │   ├── decorators/         # Custom decorators (@Roles, @Public)
│   │   ├── filters/            # Exception filters
│   │   ├── interceptors/       # Logging, correlation, transform
│   │   └── pipes/              # Validation pipes
│   ├── config/                 # Configuration module
│   ├── guards/                 # Auth, RBAC, rate limit
│   ├── services/               # JWT, token revocation, proxy, circuit breaker
│   ├── controllers/            # Explicit route controllers
│   └── types/                  # TypeScript types
├── test/
└── package.json
```

