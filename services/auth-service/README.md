# Authentication & Identity Service

Handles user authentication, session management, and OTP verification.

## Responsibilities

- User registration and login
- JWT token generation and validation
- Refresh token management
- OTP generation and verification
- Password reset
- Session management

## Database Schema

```sql
users (
  id UUID PK,
  email VARCHAR,
  mobile VARCHAR,
  password_hash TEXT,
  role VARCHAR,
  status VARCHAR,
  created_at TIMESTAMP
)

sessions (
  id UUID PK,
  user_id UUID,
  refresh_token TEXT,
  expires_at TIMESTAMP
)

otp_requests (
  id UUID PK,
  user_id UUID,
  otp_code VARCHAR,
  expires_at TIMESTAMP,
  verified BOOLEAN
)
```

## API Endpoints

- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh access token
- `POST /auth/otp/send` - Send OTP
- `POST /auth/otp/verify` - Verify OTP
- `POST /auth/logout` - Logout user
- `POST /auth/password/reset` - Reset password

## Events Published

- `UserRegistered`
- `UserLoggedIn`
- `UserLoggedOut`
- `PasswordResetRequested`

