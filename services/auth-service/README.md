🔐 Authentication & Identity Service

DoctorNow Platform

Architect Statement
The Authentication & Identity Service is a security-critical, zero-trust service responsible for issuing cryptographically secure identity tokens, managing sessions, enforcing authentication policies, and exposing public keys for platform-wide verification. It is designed to be stateless for access tokens, stateful for refresh tokens, and fully auditable for healthcare compliance.

📌 Overview

The Authentication & Identity Service manages user identity, authentication, sessions, OTP workflows, and token issuance for the DoctorNow platform.

It is the only service allowed to issue JWTs and the source of truth for identity.

🎯 Core Responsibilities

User registration and authentication

Secure password handling (hashing + policies)

JWT access token issuance (RS256)

JWKS key exposure and rotation

Refresh token lifecycle management

Session & device tracking

OTP generation and verification (hashed)

Password reset workflows

Account lockout & brute-force protection

Authentication audit event publishing

🧱 Architectural Principles

Zero Trust: No service trusts another without a verified JWT

Stateless Access Tokens: Validated at API Gateway

Stateful Refresh Tokens: Stored and managed securely

Multi-Tenant: All users belong to a tenant (hospital/platform)

Audit-First: Every security action is traceable

No PHI in Tokens or Logs

🧩 Service Boundaries
Responsibility	Location
JWT Issuance	Auth Service
JWT Validation	API Gateway
Key Rotation	Auth Service
RBAC Enforcement	API Gateway
Audit Logging	Audit & Compliance Service
🗄️ Database Schema
users
users (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  email VARCHAR UNIQUE,
  mobile VARCHAR,
  password_hash TEXT,
  role VARCHAR,
  status VARCHAR,
  failed_login_attempts INT DEFAULT 0,
  locked_until TIMESTAMP NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

sessions
sessions (
  id UUID PRIMARY KEY,
  user_id UUID,
  tenant_id UUID,
  refresh_token_hash TEXT,
  device_id VARCHAR,
  ip_address VARCHAR,
  user_agent TEXT,
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP NULL,
  created_at TIMESTAMP
)

otp_requests
otp_requests (
  id UUID PRIMARY KEY,
  user_id UUID,
  tenant_id UUID,
  otp_hash TEXT,
  purpose VARCHAR, -- LOGIN, PASSWORD_RESET
  expires_at TIMESTAMP,
  verified BOOLEAN DEFAULT FALSE,
  attempt_count INT DEFAULT 0,
  created_at TIMESTAMP
)

jwt_keys
jwt_keys (
  id UUID PRIMARY KEY,
  key_id VARCHAR UNIQUE,
  public_key TEXT,
  private_key TEXT, -- encrypted at rest
  is_active BOOLEAN,
  created_at TIMESTAMP
)

🔑 Token Model
Access Token (JWT)

Algorithm: RS256

Lifetime: 10–15 minutes

Stateless

Issued by Auth Service

Validated by API Gateway

Claims:

{
  "sub": "user-id",
  "tenant_id": "tenant-id",
  "role": "DOCTOR | PATIENT | ADMIN",
  "session_id": "session-id",
  "iss": "doctornow-platform",
  "aud": "doctornow-api"
}

Refresh Token

Long-lived

Stored hashed

Rotated on every refresh

Bound to:

session

device

IP (optional)

🔐 JWKS & Key Rotation
Public Key Endpoint (MANDATORY)
GET /.well-known/jwks.json


Used by:

API Gateway

Internal services (if needed)

Key rotation automation

Key Rotation Strategy

Multiple active keys supported

New tokens issued with latest kid

Old keys retained until token expiry

Private keys encrypted at rest

🔁 API Endpoints
Authentication

POST /auth/register

POST /auth/login

POST /auth/refresh

POST /auth/logout

POST /auth/logout-all

OTP

POST /auth/otp/send

POST /auth/otp/verify

Password

POST /auth/password/reset-request

POST /auth/password/reset-confirm

Infrastructure

GET /.well-known/jwks.json

GET /auth/health

🔔 Events Published

All events are published to the Event Bus and consumed by the Audit & Compliance Service.

UserRegistered

LoginSucceeded

LoginFailed

OtpSent

OtpVerified

SessionRevoked

PasswordResetRequested

PasswordResetCompleted

AccountLocked

🛡️ Security Controls

Password hashing (bcrypt / argon2)

OTP hashing (never stored in plaintext)

Rate limiting on login & OTP

Account lockout after repeated failures

Refresh token rotation

Session/device tracking

Tenant isolation

No sensitive data in logs

🧪 Health & Observability

/auth/health

Structured logs (no PHI)

Correlation ID support

Metrics for:

login success/failure

OTP failures

token refreshes

📜 Compliance Alignment
Regulation	Coverage
HIPAA	Audit logs, access control
GDPR	Right to access / erasure
UAE PDPL	Data minimization, residency
DHA / MOHAP	Identity traceability
NABDH / Riayati	Secure identity foundation
🚫 Explicit Non-Responsibilities

This service does NOT:

Validate JWTs on every request

Enforce RBAC on business APIs

Store or process PHI

Perform authorization checks outside identity scope

✅ Status
➡️ Next Steps

Implement NestJS Auth Service

Add Prisma schema

Implement JWKS rotation

Wire Audit events

Integrate with API Gateway