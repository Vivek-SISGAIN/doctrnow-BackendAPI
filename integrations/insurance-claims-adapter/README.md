# Insurance Claims Adapter

Adapter for submitting insurance claims to various insurance providers.

## Responsibilities

- Insurance provider authentication
- Claim submission
- Claim status checking
- Coverage verification
- Copay calculation

## Supported Providers

- UAE-based insurance companies
- International insurance providers (if applicable)

## API Endpoints

- `POST /insurance/claims/submit` - Submit claim
- `GET /insurance/claims/:claimId/status` - Check claim status
- `GET /insurance/coverage/:emiratesId` - Verify coverage
- `POST /insurance/coverage/calculate-copay` - Calculate copay

## Claim Format

Claims are submitted in the format required by each insurance provider (may vary).

