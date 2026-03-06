# Common Security Library

Shared security utilities for all microservices.

## Features

- JWT token generation and validation
- Password hashing (bcrypt)
- OTP generation
- Encryption utilities
- RBAC helpers
- Input validation
- Rate limiting helpers

## Usage

```typescript
import { generateJWT, validateJWT } from '@doctornow/common-security';
import { hashPassword, comparePassword } from '@doctornow/common-security';
import { generateOTP } from '@doctornow/common-security';
```

## Security Standards

- JWT: RS256 (asymmetric keys)
- Password hashing: bcrypt with salt rounds 12
- OTP: 6-digit numeric, 5-minute expiry
- Encryption: AES-256-GCM

