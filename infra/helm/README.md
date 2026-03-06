# Helm Charts

Helm charts for deploying DoctorNow platform.

## Charts

- `doctornow-platform/` - Main platform chart (umbrella chart)
- `doctornow-auth-service/` - Auth service chart
- `doctornow-profile-service/` - Profile service chart
- ... (one chart per service)

## Usage

```bash
# Install platform
helm install doctornow ./helm/doctornow-platform \
  --namespace doctornow \
  --create-namespace \
  --values values.yaml

# Upgrade platform
helm upgrade doctornow ./helm/doctornow-platform \
  --namespace doctornow \
  --values values.yaml
```

## Values

Each chart has configurable values:
- Replica count
- Resource limits
- Environment variables
- Database connections
- Service URLs

