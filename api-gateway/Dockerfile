# API Gateway Dockerfile
# Example using Kong or Tyk - adjust based on your gateway choice

FROM kong:3.4-alpine

# Copy Kong configuration
COPY kong.yml /usr/local/kong/declarative/kong.yml

# Expose ports
EXPOSE 8000 8443 8001 8444

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD kong health || exit 1

