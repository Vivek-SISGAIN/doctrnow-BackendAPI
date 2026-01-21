# Kubernetes Configuration

Kubernetes manifests for deploying DoctorNow platform.

## Structure

```
kubernetes/
├── namespaces/
│   └── doctornow.yaml
├── services/
│   ├── auth-service.yaml
│   ├── profile-service.yaml
│   └── ...
├── deployments/
│   ├── auth-service.yaml
│   ├── profile-service.yaml
│   └── ...
├── configmaps/
│   └── app-config.yaml
├── secrets/
│   └── app-secrets.yaml.example
└── ingress/
    └── api-gateway-ingress.yaml
```

## Prerequisites

- Kubernetes cluster (1.24+)
- Ingress controller (NGINX, Traefik, etc.)
- Cert-manager (for TLS certificates)
- External DNS (optional, for automatic DNS)

## Deployment

```bash
# Apply namespaces
kubectl apply -f namespaces/

# Apply configmaps and secrets
kubectl apply -f configmaps/
kubectl apply -f secrets/

# Deploy services
kubectl apply -f services/
kubectl apply -f deployments/

# Apply ingress
kubectl apply -f ingress/
```

