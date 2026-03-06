# Logging Library

Centralized logging utilities with structured logging support.

## Features

- Structured JSON logging
- Log levels (DEBUG, INFO, WARN, ERROR)
- Request correlation IDs
- PII masking
- Integration with centralized log aggregation (ELK, CloudWatch, etc.)

## Usage

```typescript
import { logger } from '@doctornow/logging';

logger.info('User logged in', { userId: '123' });
logger.error('Payment failed', { error, transactionId: '456' });
```

## Log Format

```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "level": "INFO",
  "service": "auth-service",
  "correlationId": "abc-123",
  "message": "User logged in",
  "metadata": {
    "userId": "123"
  }
}
```

