# DoctorNow Platform - System Overview

## Executive Summary

DoctorNow is a **cloud-native, enterprise-grade, UAE-compliant Teleconsultation Platform** built using **microservices architecture**. The platform enables patients to consult with doctors remotely via video, audio, or chat, while maintaining strict compliance with healthcare regulations and data residency requirements.

## Architecture Principles

1. **Regulatory-First Design** - Compliance (HIPAA, GDPR, UAE PDPL, DHA/MOHAP) is built into the architecture
2. **Data Isolation** - Each microservice owns its data (database per service pattern)
3. **Event-Driven** - Services communicate asynchronously via events for loose coupling
4. **Scalability** - Auto-scaling, fault tolerance, and circuit breakers built-in
5. **Observability** - Centralized logging, monitoring, and distributed tracing
6. **Security** - Defense in depth with WAF, API Gateway, encryption, RBAC

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Applications                       │
│  Patient Mobile App │ Patient Web │ Doctor Web │ Admin Web   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Edge Layer                                │
│              WAF │ API Gateway │ TLS/HTTPS                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Microservices Layer                       │
│  Auth │ Profile │ Appointment │ Consultation │ Video │ ...  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                                │
│     PostgreSQL │ MongoDB │ S3 │ Redis │ Kafka              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Integration Layer                         │
│     NABDH │ Riayati │ EMRs │ Insurance │ Payment Gateways   │
└─────────────────────────────────────────────────────────────┘
```

## Core Services

### 1. Authentication & Identity Service
- User registration and authentication
- JWT token management
- OTP verification
- Session management

### 2. User & Profile Service
- Patient profiles
- Doctor profiles
- Family member management

### 3. Appointment & Scheduling Service
- Slot management
- Appointment booking
- Availability queries

### 4. Consultation Service
- Consultation session management
- No-show tracking
- Consultation history

### 5. Video & Chat Service
- WebRTC video calls
- Real-time chat
- Screen sharing

### 6. Payment & Insurance Service
- Payment processing
- Insurance claims
- Refunds

### 7. Prescription & Medical Records Service
- Prescription generation
- Document storage
- FHIR integration

### 8. Notification Service
- SMS, Email, Push notifications
- Notification queuing

### 9. Hospital Admin Service
- Hospital management
- Doctor assignment
- Hospital analytics

### 10. Platform Super Admin Service
- Platform administration
- User management
- System monitoring

### 11. Audit & Compliance Service
- Audit logging
- Compliance reporting
- Access tracking

## Data Residency

**All PHI (Protected Health Information) is stored inside UAE** to comply with:
- UAE PDPL (Personal Data Protection Law)
- DHA/MOHAP regulations
- Data sovereignty requirements

## Technology Stack

- **Runtime**: Node.js, Python, or Java (service-specific)
- **Databases**: PostgreSQL (relational), MongoDB (NoSQL)
- **Message Queue**: Kafka or RabbitMQ
- **Cache**: Redis
- **Object Storage**: S3-compatible (MinIO, AWS S3 UAE region)
- **API Gateway**: Kong, Tyk, or AWS API Gateway
- **Container Orchestration**: Kubernetes
- **Monitoring**: Prometheus, Grafana, ELK Stack
- **Tracing**: Jaeger

## Deployment

- **Cloud Provider**: AWS/Azure/GCP with UAE region preference
- **Containerization**: Docker
- **Orchestration**: Kubernetes (EKS/AKS/GKE)
- **Infrastructure as Code**: Terraform
- **CI/CD**: GitHub Actions, GitLab CI, or Jenkins

## Security

- **Authentication**: JWT with refresh tokens
- **Authorization**: RBAC (Role-Based Access Control)
- **Encryption**: AES-256 at rest, TLS 1.3 in transit
- **Network**: VPC, security groups, WAF
- **Compliance**: Regular audits, penetration testing

## Scalability

- **Horizontal Scaling**: Auto-scaling based on CPU/memory/request rate
- **Database Scaling**: Read replicas, connection pooling
- **Caching**: Redis for frequently accessed data
- **CDN**: For static assets and media

## Disaster Recovery

- **Backup**: Daily automated backups
- **Replication**: Multi-AZ deployment
- **RTO**: < 1 hour
- **RPO**: < 15 minutes

