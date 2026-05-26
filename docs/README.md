# Cybersecurity Platform

A multi-tenant, microservices-based cybersecurity platform with 8 independent modules.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway (Port 3000)                │
│              (Tenant Isolation + Service Proxy)              │
└─────────────┬───────────────────────────────────┬───────────┘
              │                                   │
              ▼                                   ▼
┌─────────────────────┐              ┌────────────────────────┐
│   Message Queue     │              │   Service Registry     │
│   (RabbitMQ)        │              │   (Kubernetes)         │
└─────────┬───────────┘              └────────────────────────┘
          │
    ┌─────┴─────┬──────────┬──────────┬──────────┬──────────┐
    ▼           ▼          ▼          ▼          ▼          ▼
┌──────┐  ┌──────┐  ┌────────┐  ┌───┐  ┌──────┐  ┌──────┐
│ WAF  │  │ NGFW │  │ SIEM/  │  │ V │  │ Fraud│  │Aware-│
│3001  │  │ 3002 │  │ SOAR   │  │ S  │  │Det.  │  │ness  │
│      │  │      │  │ 3003   │  │ 4  │  │ 3005 │  │ 3006 │
└──────┘  └──────┘  └────────┘  └───┘  └──────┘  └──────┘
                                          ┌──────┐  ┌──────┐
                                          │ GRC  │  │ IAM  │
                                          │ 3007 │  │ 3008 │
                                          └──────┘  └──────┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| API Gateway | 3000 | Entry point, tenant isolation, service proxy |
| WAF | 3001 | Web Application Firewall - SQL injection, XSS protection |
| NGFW | 3002 | Next-Gen Firewall - Network traffic inspection |
| SIEM/SOAR | 3003 | Security monitoring, incident response |
| Vulnerability Scanner | 3004 | Automated vulnerability scanning |
| Fraud Detection | 3005 | Transaction monitoring, risk scoring |
| Awareness Platform | 3006 | Phishing simulation, security training |
| GRC | 3007 | Governance, Risk, Compliance management |
| IAM | 3008 | Identity & Access Management |

## Multi-Tenancy

Each tenant has:
- Isolated data storage (in-memory maps, replace with DB in production)
- Separate configuration and settings
- Module-level access control
- Independent API quotas

## Quick Start

### Local Development

```bash
# Start all services
docker-compose up -d

# Create a tenant
curl -X POST http://localhost:3000/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "id": "tenant-1",
    "name": "Acme Corp",
    "domain": "acme.com",
    "plan": "enterprise",
    "settings": {
      "dataRetentionDays": 90,
      "maxRequestsPerSecond": 1000,
      "enabledModules": ["waf", "ngfw", "siem-soar", "vuln-scanner", "fraud-detection", "awareness", "grc", "iam"],
      "alertChannels": []
    },
    "active": true,
    "createdAt": "2026-05-03T00:00:00Z",
    "updatedAt": "2026-05-03T00:00:00Z"
  }'

# Use tenant context
export TENANT_ID="tenant-1"

# Test WAF
curl -X POST http://localhost:3000/waf/rules \
  -H "x-tenant-id: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"pattern": "SELECT.*FROM", "action": "block", "type": "sql-injection"}'

# Test IAM - Create user
curl -X POST http://localhost:3000/iam/users \
  -H "x-tenant-id: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@acme.com", "password": "SecurePass123!", "roles": ["admin"]}'
```

### Kubernetes Deployment

```bash
kubectl apply -f deploy/kubernetes/rabbitmq.yaml
kubectl apply -f deploy/kubernetes/api-gateway.yaml
kubectl apply -f deploy/kubernetes/all-services.yaml
```

## API Examples

### WAF - Create Rule
```bash
curl -X POST http://localhost:3000/waf/rules \
  -H "x-tenant-id: tenant-1" \
  -H "Content-Type: application/json" \
  -d '{"pattern": "DROP TABLE", "action": "block", "type": "sql-injection"}'
```

### SIEM - Log Entry
```bash
curl -X POST http://localhost:3000/siem-soar/logs \
  -H "x-tenant-id: tenant-1" \
  -H "Content-Type: application/json" \
  -d '{"source": "firewall", "level": "critical", "message": "Breach detected"}'
```

### Vulnerability Scan
```bash
curl -X POST http://localhost:3000/vuln-scanner/scans \
  -H "x-tenant-id: tenant-1" \
  -H "Content-Type: application/json" \
  -d '{"target": "192.168.1.0/24"}'
```

## Fault Isolation

- Services communicate asynchronously via RabbitMQ
- If one service fails, others continue operating
- API Gateway returns 503 for unavailable services
- Each service has health check endpoint `/health`

## Production Considerations

1. Replace in-memory storage with persistent databases (PostgreSQL, MongoDB)
2. Add Redis for caching and session storage
3. Implement proper service discovery (Consul, etcd)
4. Add centralized logging (ELK stack)
5. Implement distributed tracing (Jaeger, Zipkin)
6. Add rate limiting and DDoS protection
7. Secure inter-service communication with mTLS
8. Add monitoring with Prometheus/Grafana
