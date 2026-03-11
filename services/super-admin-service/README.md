# Platform Super Admin Service

Manages platform-wide administration and configuration.

## Responsibilities

- Platform configuration
- User management (all roles)
- System monitoring
- Feature flags
- Platform analytics
- Compliance reporting
- System health monitoring

## API Endpoints

- `GET /admin/users` - List all users
- `PUT /admin/users/:id/status` - Update user status
- `GET /admin/analytics` - Platform analytics
- `GET /admin/compliance/report` - Compliance report
- `GET /admin/system/health` - System health check
- `PUT /admin/feature-flags` - Update feature flags

## Events Published

- `UserStatusChanged`
- `FeatureFlagUpdated`
- `ComplianceReportGenerated`
