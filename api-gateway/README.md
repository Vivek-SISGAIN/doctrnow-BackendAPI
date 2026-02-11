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

## How to run

1. **Install dependencies** (from `api-gateway` folder):
   ```bash
   cd doctrnow-BackendAPI/api-gateway
   npm install
   ```

2. **Run Redis** (required for rate limiting and token revocation).  
   - Local: start Redis on `localhost:6379`, or set `REDIS_HOST` / `REDIS_PORT` in `.env`.  
   - Docker: `docker run -d -p 6379:6379 redis:alpine`

3. **Start the gateway**:
   - **Development** (watch mode, recommended for testing):
     ```bash
     npm run start:dev
     ```
   - **One-off run**: `npm run start`
   - **Production** (after build): `npm run build` then `npm run start:prod`

4. **Verify**: Gateway listens on **port 8080** by default.  
   - Health: `http://localhost:8080/api` (or see your health route).  
   - Swagger (when not in production): `http://localhost:8080/api-docs`

**Note:** This is a **NestJS** app. Do not run `node server.js`; use the npm scripts above.

### Testing appointments without auth (development)

In **development**, the gateway can skip JWT for `/api/v1/appointments` so you can test the appointment API without running the auth-service. This is controlled by `SKIP_APPOINTMENT_AUTH` (default: **true** when `NODE_ENV !== 'production'`). To **enable JWT** for appointments (e.g. when auth-service is running), set in `.env`:

```bash
SKIP_APPOINTMENT_AUTH=false
```

### Full auth integration (doctor login → appointments)

For real login and JWT-protected appointments:

1. **Run auth-service** (e.g. port 3001), ensure it exposes `/.well-known/jwks.json` for RS256.
2. **Run profile-service** if the doctor portal needs profile data (port 3002).
3. **Database + seed**: Use each service’s Prisma setup and seed (e.g. `npm run db:setup`, `npm run seed` in auth-service and profile-service).
4. **Doctor portal**: Call login via the gateway (`POST /api/v1/auth/login` or your auth endpoint), store the returned JWT (e.g. in `localStorage`), and send it as `Authorization: Bearer <token>` on requests to `/api/v1/appointments`.
5. Set **`SKIP_APPOINTMENT_AUTH=false`** in the gateway so appointment routes require a valid token.

## Configuration

See `openapi.yaml` for API specifications. Environment variables: `configuration.ts` and `.env`.

