# Error Handling Library

Standardized error handling and error types across services.

## Error Types

- `ValidationError` - Input validation failures
- `AuthenticationError` - Authentication failures
- `AuthorizationError` - Authorization failures
- `NotFoundError` - Resource not found
- `ConflictError` - Resource conflicts (e.g., duplicate)
- `ExternalServiceError` - Third-party service failures
- `DatabaseError` - Database operation failures

## Usage

```typescript
import { ValidationError, NotFoundError } from '@doctornow/error-handling';

throw new ValidationError('Invalid email format');
throw new NotFoundError('Appointment not found', { appointmentId: '123' });
```

## Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": {},
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

