# Authentication Service - API Examples

## Base URL
- **Development**: `http://localhost:3001`
- **Production**: `https://auth.doctornow.ae`

## API Endpoints

### 1. Register New User

**Endpoint**: `POST /auth/v1/register`

**Request Body**:
```json
{
  "email": "patient@example.com",
  "mobile": "+971501234567",
  "password": "SecurePass123!",
  "role": "PATIENT",
  "tenantId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**cURL**:
```bash
curl -X POST http://localhost:3001/auth/v1/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient@example.com",
    "mobile": "+971501234567",
    "password": "SecurePass123!",
    "role": "PATIENT",
    "tenantId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

**Postman**:
- Method: `POST`
- URL: `http://localhost:3001/auth/v1/register`
- Headers: `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "email": "patient@example.com",
  "mobile": "+971501234567",
  "password": "SecurePass123!",
  "role": "PATIENT",
  "tenantId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response** (201 Created):
```json
{
  "data": {
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "email": "patient@example.com",
    "role": "PATIENT",
    "status": "PENDING_VERIFICATION"
  },
  "timestamp": "2026-01-28T13:00:00.000Z",
  "correlationId": "abc-123-def"
}
```

**Password Requirements**:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- Optional: special character (if configured)

**Role Options**:
- `PATIENT`
- `DOCTOR`
- `HOSPITAL_ADMIN`
- `SUPER_ADMIN`

---

### 2. User Login

**Endpoint**: `POST /auth/v1/login`

**Request Body**:
```json
{
  "email": "patient@example.com",
  "password": "SecurePass123!",
  "tenantId": "550e8400-e29b-41d4-a716-446655440000",
  "deviceId": "device-uuid-optional"
}
```

**cURL**:
```bash
curl -X POST http://localhost:3001/auth/v1/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient@example.com",
    "password": "SecurePass123!",
    "tenantId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

**Response** (200 OK):
```json
{
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "abc123def456...",
    "expiresIn": 900,
    "user": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "patient@example.com",
      "role": "PATIENT",
      "tenantId": "550e8400-e29b-41d4-a716-446655440000"
    }
  },
  "timestamp": "2026-01-28T13:00:00.000Z",
  "correlationId": "abc-123-def"
}
```

---

### 3. Refresh Access Token

**Endpoint**: `POST /auth/v1/refresh`

**Request Body**:
```json
{
  "refreshToken": "abc123def456..."
}
```

**cURL**:
```bash
curl -X POST http://localhost:3001/auth/v1/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "your-refresh-token-here"
  }'
```

**Response** (200 OK):
```json
{
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "new-refresh-token-rotated",
    "expiresIn": 900
  },
  "timestamp": "2026-01-28T13:00:00.000Z",
  "correlationId": "abc-123-def"
}
```

---

### 4. Send OTP

**Endpoint**: `POST /auth/v1/otp/send`

**Request Body**:
```json
{
  "email": "patient@example.com",
  "purpose": "LOGIN",
  "tenantId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Purpose Options**:
- `LOGIN`
- `PASSWORD_RESET`
- `REGISTRATION`

**cURL**:
```bash
curl -X POST http://localhost:3001/auth/v1/otp/send \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient@example.com",
    "purpose": "LOGIN",
    "tenantId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

**Response** (200 OK):
```json
{
  "data": {
    "message": "OTP sent successfully"
  },
  "timestamp": "2026-01-28T13:00:00.000Z",
  "correlationId": "abc-123-def"
}
```

---

### 5. Verify OTP

**Endpoint**: `POST /auth/v1/otp/verify`

**Request Body**:
```json
{
  "email": "patient@example.com",
  "otp": "123456",
  "purpose": "LOGIN",
  "tenantId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**cURL**:
```bash
curl -X POST http://localhost:3001/auth/v1/otp/verify \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient@example.com",
    "otp": "123456",
    "purpose": "LOGIN",
    "tenantId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

**Response** (200 OK):
```json
{
  "data": {
    "verified": true,
    "userId": "123e4567-e89b-12d3-a456-426614174000"
  },
  "timestamp": "2026-01-28T13:00:00.000Z",
  "correlationId": "abc-123-def"
}
```

---

### 6. Request Password Reset

**Endpoint**: `POST /auth/v1/password/reset-request`

**Request Body**:
```json
{
  "email": "patient@example.com",
  "tenantId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**cURL**:
```bash
curl -X POST http://localhost:3001/auth/v1/password/reset-request \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient@example.com",
    "tenantId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

**Response** (200 OK):
```json
{
  "data": {
    "message": "If the email exists, a password reset link has been sent"
  },
  "timestamp": "2026-01-28T13:00:00.000Z",
  "correlationId": "abc-123-def"
}
```

---

### 7. Confirm Password Reset

**Endpoint**: `POST /auth/v1/password/reset-confirm`

**Request Body**:
```json
{
  "token": "reset-token-from-email",
  "newPassword": "NewSecurePass123!"
}
```

**cURL**:
```bash
curl -X POST http://localhost:3001/auth/v1/password/reset-confirm \
  -H "Content-Type: application/json" \
  -d '{
    "token": "reset-token-from-email",
    "newPassword": "NewSecurePass123!"
  }'
```

**Response** (200 OK):
```json
{
  "data": {
    "message": "Password reset successfully"
  },
  "timestamp": "2026-01-28T13:00:00.000Z",
  "correlationId": "abc-123-def"
}
```

---

### 8. Logout

**Endpoint**: `POST /auth/v1/logout`

**Headers**:
```
Authorization: Bearer <access-token>
```

**Request Body**:
```json
{
  "sessionId": "session-uuid"
}
```

**cURL**:
```bash
curl -X POST http://localhost:3001/auth/v1/logout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access-token>" \
  -d '{
    "sessionId": "session-uuid"
  }'
```

---

### 9. Logout All Sessions

**Endpoint**: `POST /auth/v1/logout-all`

**Headers**:
```
Authorization: Bearer <access-token>
```

**cURL**:
```bash
curl -X POST http://localhost:3001/auth/v1/logout-all \
  -H "Authorization: Bearer <access-token>"
```

---

### 10. JWKS Endpoint

**Endpoint**: `GET /.well-known/jwks.json`

**cURL**:
```bash
curl http://localhost:3001/.well-known/jwks.json
```

**Response** (200 OK):
```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "key-id-here",
      "n": "modulus...",
      "e": "AQAB",
      "alg": "RS256"
    }
  ]
}
```

---

### 11. Health Check

**Endpoint**: `GET /auth/health`

**cURL**:
```bash
curl http://localhost:3001/auth/health
```

**Response** (200 OK):
```json
{
  "status": "healthy",
  "service": "auth-service",
  "timestamp": "2026-01-28T13:00:00.000Z"
}
```

---

## Common Error Responses

### 400 Bad Request
```json
{
  "error": {
    "statusCode": 400,
    "message": "Password does not meet requirements",
    "errors": [
      "Password must be at least 8 characters long",
      "Password must contain at least one uppercase letter"
    ],
    "timestamp": "2026-01-28T13:00:00.000Z",
    "correlationId": "abc-123-def",
    "path": "/auth/v1/register"
  }
}
```

### 401 Unauthorized
```json
{
  "error": {
    "statusCode": 401,
    "message": "Invalid credentials",
    "timestamp": "2026-01-28T13:00:00.000Z",
    "correlationId": "abc-123-def",
    "path": "/auth/v1/login"
  }
}
```

### 409 Conflict
```json
{
  "error": {
    "statusCode": 409,
    "message": "User with this email or mobile already exists",
    "timestamp": "2026-01-28T13:00:00.000Z",
    "correlationId": "abc-123-def",
    "path": "/auth/v1/register"
  }
}
```

---

## Testing with Swagger UI

1. Start the service: `npm run start:dev`
2. Open browser: `http://localhost:3001/api-docs`
3. Use "Try it out" on any endpoint
4. Fill in the request body
5. Execute and see response

---

## Notes

- All endpoints require `Content-Type: application/json` header
- `tenantId` is required for multi-tenant support
- Passwords are never returned in responses
- OTP codes are hashed before storage
- Refresh tokens rotate on each use
- Account locks after 5 failed login attempts for 30 minutes
