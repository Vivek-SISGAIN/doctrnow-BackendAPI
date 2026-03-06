# Terraform Infrastructure

Infrastructure as Code for DoctorNow platform on cloud providers.

## Supported Providers

- AWS
- Azure
- GCP
- Alibaba Cloud (for UAE region)

## Modules

- `vpc/` - Virtual Private Cloud
- `rds/` - Relational databases (PostgreSQL)
- `s3/` - Object storage
- `eks/` or `aks/` or `gke/` - Kubernetes cluster
- `networking/` - Load balancers, WAF, CDN
- `monitoring/` - CloudWatch, Prometheus, Grafana
- `security/` - IAM roles, security groups, encryption

## Usage

```bash
# Initialize
terraform init

# Plan
terraform plan

# Apply
terraform apply
```

## Environment Variables

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `TF_VAR_environment` (dev/staging/prod)

