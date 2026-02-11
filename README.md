# DoctorNow Platform

**Enterprise-grade, UAE-compliant Teleconsultation Platform**

> "DoctorNow is designed as a **regulatory-first, event-driven microservices platform**, with strict data isolation, auditability, and UAE healthcare compliance at its core. Every domain owns its data, every action is traceable, and scalability is built-in."

## 🏗️ Architecture

- **Architecture Pattern**: Microservices with API Gateway
- **Compliance**: HIPAA, GDPR, UAE PDPL, DHA/MOHAP Telehealth Standards
- **Data Residency**: All PHI stored inside UAE
- **Communication**: Event-driven (Kafka/RabbitMQ)
- **Databases**: PostgreSQL (relational), MongoDB/DynamoDB (NoSQL), S3-compatible (object storage)

## 📁 Repository Structure

```
doctornow-platform/
├── api-gateway/          # API Gateway (Kong/Tyk/AWS API Gateway)
├── services/             # Core microservices (11 services)
├── integrations/         # Third-party adapters (NABDH, Riayati, EMRs)
├── libs/                 # Shared libraries
├── infra/                # Infrastructure as Code
└── docs/                 # Documentation
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (or your preferred runtime)
- PostgreSQL 14+
- MongoDB (for notifications/logs)
- Kafka/RabbitMQ (for events)

### Development Setup

```bash
# Start infrastructure services
docker-compose -f infra/docker-compose.dev.yml up -d

# Install dependencies (example for Node.js services)
npm install

# Run services locally
npm run dev
```

### Database setup and seed (auth-service + profile-service)

Use **PostgreSQL** (e.g. two databases: `auth_db` and `profile_db`).

1. **Auth-service** (from `services/auth-service`):
   - Set `.env`: `DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/auth_db`
   - Run: `npm run db:setup` (creates tables and seeds doctor + patient users)
   - Seed login: `doctor@doctornow.com` / `Password123!` and `patient@doctornow.com` / `Password123!`

2. **Profile-service** (from `services/profile-service`):
   - Set `.env`: `DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/profile_db`
   - Run: `npm run db:setup` (applies migrations and seeds patient + doctor profiles linked to auth user IDs)

See each service’s README for details.

## 🔐 Security

- JWT-based authentication
- OAuth2 support
- RBAC enforcement
- Encryption at rest & in transit
- WAF protection
- Rate limiting

## 📊 Services

1. **Authentication & Identity Service** - User authentication, sessions, OTP
2. **User & Profile Service** - Patient/Doctor profiles, family members
3. **Appointment & Scheduling Service** - Slots, appointments, booking
4. **Consultation Service** - Video consultations, no-show tracking
5. **Video & Chat Service** - WebRTC, real-time messaging
6. **Payment & Insurance Service** - Transactions, insurance claims, refunds
7. **Prescription & Medical Records Service** - Prescriptions, documents
8. **Notification Service** - SMS, Email, Push notifications
9. **Hospital Admin Service** - Hospital management
10. **Platform Super Admin Service** - Platform administration
11. **Audit & Compliance Service** - Audit logs, compliance tracking

## 🔗 Integrations

- **NABDH** (Dubai) - FHIR adapter
- **Riayati** (NUMR) - FHIR adapter
- **EMR Systems** - Cerner, Epic adapters
- **Payment Gateways** - Multiple providers
- **Insurance eClaims** - Insurance integration
- **Video SDK** - WebRTC/Twilio/Agora

## 📚 Documentation

- [Architecture Documentation](./docs/architecture/)
- [API Contracts](./docs/api-contracts/)
- [Compliance Guide](./docs/compliance/)

## 🛠️ Development

### Adding a New Service

1. Create service directory in `services/`
2. Follow the standard structure:
   ```
   src/
   ├── controller/
   ├── service/
   ├── repository/
   ├── domain/
   ├── dto/
   ├── events/
   ├── security/
   └── config/
   ```
3. Add OpenAPI spec (`openapi.yaml`)
4. Add Dockerfile
5. Register in API Gateway

## 📝 License

Proprietary - DoctorNow Platform

