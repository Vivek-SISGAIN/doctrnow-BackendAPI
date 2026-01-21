# DoctorNow Platform - Quick Start Guide

## Prerequisites

- Docker & Docker Compose
- Node.js 18+ (or your preferred runtime)
- PostgreSQL 14+ (or use Docker)
- MongoDB (or use Docker)
- Kafka/RabbitMQ (or use Docker)

## Step 1: Clone and Setup

```bash
# Clone repository
git clone <repository-url>
cd doctornow-platform

# Install dependencies (if using Node.js)
npm install
```

## Step 2: Start Infrastructure

```bash
# Start PostgreSQL, MongoDB, Redis, Kafka
docker-compose up -d

# Verify services are running
docker-compose ps
```

## Step 3: Setup Databases

```bash
# Run migrations for each service
# Example for auth service:
psql -h localhost -U doctornow -d auth_db -f services/auth-service/src/database/schema.sql

# Repeat for other services:
# - profile-service
# - appointment-service
# - payment-insurance-service
# - medical-records-service
# - audit-compliance-service
```

## Step 4: Configure Environment Variables

Create `.env` files for each service:

```bash
# Example: services/auth-service/.env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=auth_db
DB_USER=doctornow
DB_PASSWORD=changeme
JWT_SECRET=your-secret-key
KAFKA_BROKERS=localhost:9092
```

## Step 5: Start Services

### Option A: Using Docker Compose (Recommended for Development)

```bash
# Build all services
docker-compose -f docker-compose.services.yml build

# Start all services
docker-compose -f docker-compose.services.yml up
```

### Option B: Run Locally

```bash
# Start each service individually
cd services/auth-service
npm install
npm run dev

# In separate terminals:
cd services/profile-service && npm run dev
cd services/appointment-service && npm run dev
# ... etc
```

## Step 6: Start API Gateway

```bash
cd api-gateway
# Configure gateway routes
# Start gateway (depends on gateway choice: Kong, Tyk, etc.)
```

## Step 7: Verify Setup

```bash
# Health check
curl http://localhost:8080/api/v1/health

# Test authentication (after implementing)
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","role":"PATIENT"}'
```

## Development Workflow

### Adding a New Service

1. Create directory: `services/new-service/`
2. Follow standard structure (see `ARCHITECTURE.md`)
3. Add OpenAPI spec
4. Add Dockerfile
5. Register in API Gateway
6. Add to `docker-compose.services.yml`

### Running Tests

```bash
# Run all tests
npm test

# Run tests for specific service
npm test --workspace=services/auth-service
```

### Database Migrations

```bash
# Run migrations
npm run migrate

# Rollback (if supported)
npm run migrate:rollback
```

## Production Deployment

See `infra/` directory for:
- Kubernetes manifests (`infra/kubernetes/`)
- Helm charts (`infra/helm/`)
- Terraform configs (`infra/terraform/`)

## Troubleshooting

### Services not starting

1. Check Docker containers: `docker-compose ps`
2. Check logs: `docker-compose logs <service-name>`
3. Verify database connections
4. Check environment variables

### Database connection errors

1. Verify database is running: `docker-compose ps postgres-auth`
2. Check connection string in `.env`
3. Verify database exists: `psql -h localhost -U doctornow -l`

### Port conflicts

Modify ports in `docker-compose.yml` if default ports are in use.

## Next Steps

1. Review `ARCHITECTURE.md` for detailed architecture
2. Check `docs/` for API documentation
3. Review compliance requirements in `docs/compliance/`
4. Set up monitoring (see `infra/monitoring/`)

## Support

For issues or questions:
- Check documentation in `docs/`
- Review architecture in `ARCHITECTURE.md`
- Check service-specific README files

