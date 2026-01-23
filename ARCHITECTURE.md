# DoctorNow Platform - Architecture Document

> **Architect Statement**: "DoctorNow is designed as a **regulatory-first, event-driven microservices platform**, with strict data isolation, auditability, and UAE healthcare compliance at its core. Every domain owns its data, every action is traceable, and scalability is built-in."

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Patterns](#architecture-patterns)
3. [Service Design](#service-design)
4. [Data Architecture](#data-architecture)
5. [Security Architecture](#security-architecture)
6. [Integration Architecture](#integration-architecture)
7. [Deployment Architecture](#deployment-architecture)
8. [Compliance & Regulations](#compliance--regulations)

## System Overview

DoctorNow is a cloud-native teleconsultation platform enabling remote healthcare consultations while maintaining strict compliance with UAE healthcare regulations. The platform includes a dedicated Audit & Compliance Service that ensures all actions are traceable and regulatory requirements are met.

### Key Characteristics

- **Microservices Architecture**: 11 core services, each with its own database
- **Multi-Tenant Support**: Platform supports multiple hospitals/organizations with data isolation
- **Event-Driven**: Asynchronous communication via Kafka/RabbitMQ
- **API Gateway Pattern**: Single entry point for all client requests
- **Database per Service**: Data isolation and autonomy
- **Stateless Services**: All services are stateless for horizontal scalability
- **UAE Data Residency**: All PHI stored within UAE borders

## Architecture Patterns

### 1. Microservices Pattern

Each service is:
- Independently deployable
- Owns its data
- Communicates via APIs or events
- Can scale independently

### 2. API Gateway Pattern

All client requests route through the API Gateway which handles:
- Authentication/Authorization
- Rate limiting
- Request routing
- API versioning
- Request/Response logging and monitoring

### 3. Event-Driven Architecture

Services publish domain events for:
- Loose coupling
- Eventual consistency
- Scalability
- Audit trail

### 4. Database per Service

Each service has its own database:
- Data isolation
- Technology choice flexibility
- Independent scaling
- Service autonomy

## Service Design

### Core Microservices (11 Services)

The platform consists of 11 core microservices, each with its own database and specific responsibilities:

1. **Authentication & Identity Service** - User registration, authentication, JWT token management, OTP verification, session management, token revocation
2. **User & Profile Service** - Patient profiles, doctor profiles, family member management, Emirates ID verification
3. **Appointment & Scheduling Service** - Slot management, appointment booking, availability queries, slot locking to prevent double-booking
4. **Consultation Service** - Consultation session management, start/end tracking, no-show detection and recording, consultation history
5. **Video & Chat Service** - WebRTC video calls, real-time chat messaging, screen sharing, call recording (with consent)
6. **Payment & Insurance Service** - Payment processing, insurance claim submission, copay calculation, refund processing, transaction history
7. **Prescription & Medical Records Service** - Prescription generation, medical document storage, FHIR integration for NABDH/Riayati
8. **Notification Service** - SMS, Email, and Push notifications, notification queuing and retry, delivery status tracking
9. **Hospital Admin Service** - Hospital profile management, doctor assignment and approval, department management, hospital analytics
10. **Platform Super Admin Service** - Platform-wide administration, user management, system monitoring, feature flags, compliance reporting
11. **Audit & Compliance Service** - Comprehensive audit logging, compliance reporting (HIPAA, GDPR, UAE PDPL), access tracking, data access logs, consent records

### Service Characteristics

- **Stateless**: All services are stateless, enabling horizontal scaling and load balancing
- **Multi-Tenant**: Services support multiple hospitals/organizations with tenant isolation
- **Independent**: Each service can be developed, deployed, and scaled independently

### Standard Service Structure

```
service-name/
├── src/
│   ├── controller/     # HTTP handlers
│   ├── service/        # Business logic
│   ├── repository/     # Data access
│   ├── domain/         # Domain models
│   ├── dto/            # Data transfer objects
│   ├── events/         # Domain events
│   ├── security/       # Security utilities
│   └── config/         # Configuration
├── openapi.yaml        # API specification
└── Dockerfile          # Container definition
```

### Service Communication

1. **Synchronous**: REST APIs via API Gateway (for request/response)
2. **Asynchronous**: Events via Kafka/RabbitMQ (for decoupled operations)
3. **Circuit Breakers**: Implemented for external service calls to prevent cascading failures

## Data Architecture

### Database Strategy

- **PostgreSQL**: Relational data (users, appointments, transactions)
- **MongoDB**: Document storage (notifications, chat messages)
- **Redis**: Caching layer (cache frequently accessed data, rate limiting counters, distributed locks - not used for session storage)
- **S3-compatible**: Object storage (documents, recordings)

### Data Flow

1. **Write**: Service → Database
2. **Read**: Service → Database (with caching)
3. **Events**: Service → Kafka → Other Services
4. **Sync**: Service → Integration Adapter → External System

## Security Architecture

### Defense in Depth

1. **Edge**: WAF, DDoS protection
2. **API Gateway**: Authentication, authorization, rate limiting
3. **Services**: Input validation, RBAC enforcement
4. **Data**: Encryption at rest and in transit
5. **Network**: VPC, security groups, private subnets

### Authentication Flow

```
Client → API Gateway → Auth Service
                    ↓
              JWT Token
                    ↓
         API Gateway validates
                    ↓
         Request forwarded to service
```

### Token Management

- **JWT Tokens**: Access tokens (short-lived) and refresh tokens (long-lived)
- **Token Revocation**: Refresh tokens can be revoked, access tokens validated on each request
- **Token Blacklist**: Revoked tokens tracked for immediate invalidation

### Authorization

- **RBAC**: Role-Based Access Control
- **Permissions**: Fine-grained permissions per role
- **Audit**: All access logged via Audit & Compliance Service

## Integration Architecture

### Third-Party Integrations

1. **NABDH (Dubai)**: FHIR adapter for health information exchange
2. **Riayati (NUMR)**: FHIR adapter for national medical records
3. **EMR Systems**: Cerner, Epic adapters
4. **Payment Gateways**: Multiple providers
5. **Insurance**: eClaims integration
6. **Video SDK**: WebRTC/Twilio/Agora

### Integration Pattern

```
Service → Integration Adapter → External API
         (FHIR conversion, auth, retry logic)
```

## Deployment Architecture

### Infrastructure

- **Cloud**: AWS/Azure/GCP (UAE region preferred)
- **Containers**: Docker
- **Orchestration**: Kubernetes
- **IaC**: Terraform
- **CI/CD**: GitHub Actions/GitLab CI

### High Availability

- **Multi-AZ**: Deploy across availability zones
- **Load Balancing**: Application and database load balancers
- **Auto-scaling**: Horizontal pod autoscaling
- **Health Checks**: Liveness and readiness probes
- **Circuit Breakers**: Prevent cascading failures when services are unavailable

## Compliance & Regulations

### Standards Compliance

- **HIPAA**: Health Insurance Portability and Accountability Act
- **GDPR**: General Data Protection Regulation
- **UAE PDPL**: UAE Personal Data Protection Law
- **DHA/MOHAP**: Dubai Health Authority / Ministry of Health standards
- **NABDH**: Dubai Health Information Exchange requirements
- **Riayati**: National Unified Medical Record requirements

### Compliance Features

- **Data Residency**: All PHI in UAE
- **Encryption**: At rest and in transit
- **Audit Logging**: All actions logged by Audit & Compliance Service
- **Access Control**: RBAC with least privilege
- **Consent Management**: Patient consent tracking and management for data processing
- **Data Retention**: Configurable retention policies
- **Right to Access/Erasure**: GDPR compliance
- **Audit & Compliance Service**: Dedicated service for comprehensive audit trails, compliance reporting, and regulatory adherence

## Scalability

### Horizontal Scaling

- Services scale independently
- Database read replicas
- Caching layer (Redis)
- CDN for static assets

### Performance Optimization

- Database indexing
- Query optimization
- Connection pooling
- Async processing

## Monitoring & Observability

### Metrics

- Service health
- Request rates and latencies
- Error rates
- Resource utilization

### Logging

- Centralized logging (ELK Stack)
- Structured logs (JSON)
- Correlation IDs
- PII masking

### Tracing

- Distributed tracing (Jaeger)
- Request flow visualization
- Performance bottleneck identification

## Disaster Recovery

### Backup Strategy

- Daily automated backups
- Point-in-time recovery
- Cross-region backups (within UAE)

### Recovery Objectives

- **RTO**: < 1 hour
- **RPO**: < 15 minutes

## Next Steps

1. Generate detailed sequence diagrams
2. Create RBAC permission matrix
3. Define Phase-1 MVP scope
4. Set up CI/CD pipeline
5. Create deployment runbooks

