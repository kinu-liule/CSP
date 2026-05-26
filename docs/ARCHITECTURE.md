# Architecture Overview

## Design Principles

1. **Independence**: Each service runs independently, fails without cascading
2. **Multi-Tenancy**: Complete tenant isolation at API and data level
3. **Loose Coupling**: Services communicate via RabbitMQ message queue
4. **Scalability**: Each service can scale independently via Kubernetes
5. **Resilience**: Health checks, graceful degradation, fault isolation

## Service Communication

```
Service A --publish--> RabbitMQ Exchange --> Queue --> Service B
                      (cybersec.events)      (tenant.service.*)
```

## Tenant Isolation Strategy

- **Request Level**: `x-tenant-id` header validates tenant on every request
- **Data Level**: In-memory Maps keyed by tenantId (use DB per tenant in prod)
- **Module Level**: Tenants can enable/disable specific modules
- **Rate Limiting**: Per-tenant quotas via `maxRequestsPerSecond`

## Failure Scenarios

| Failure | Impact | Mitigation |
|---------|--------|------------|
| WAF down | Only WAF protection lost | Other services operational |
| RabbitMQ down | Async messaging fails | Services continue with local ops |
| API Gateway down | No external access | Internal services still running |
| IAM down | New logins fail | Existing tokens still valid |

## Data Flow Example

1. Request → API Gateway (tenant validation)
2. API Gateway → Proxy to target service
3. Service processes request, publishes events to RabbitMQ
4. Other services consume relevant events
5. Health checks monitor all services

## Technology Stack

- **Runtime**: Node.js with TypeScript
- **API Gateway**: Express + http-proxy-middleware
- **Message Queue**: RabbitMQ with topic exchanges
- **Container**: Docker + Kubernetes
- **Auth**: JWT tokens + bcrypt
- **Proxies**: Tenant-aware request routing

## Production Hardening Checklist

- [ ] Replace in-memory stores with PostgreSQL/MongoDB
- [ ] Add Redis for distributed caching
- [ ] Implement mTLS for service-to-service auth
- [ ] Add Prometheus metrics endpoint
- [ ] Centralized logging with ELK stack
- [ ] Add distributed tracing (Jaeger)
- [ ] Implement circuit breakers
- [ ] Add API rate limiting per tenant
- [ ] Database per tenant or row-level security
- [ ] Secret management with Vault
