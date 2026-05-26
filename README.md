# CyberSec Platform

A comprehensive cybersecurity operations platform with 22 microservices, API Gateway, CI/CD, and seeded data — all running via Docker Compose.

## Architecture

```
┌──────────┐   ┌───────────┐   ┌──────────┐
│  Nginx   │──▶│API Gateway│──▶│ Frontend │
│ (80/443) │   │   (3000)  │   │  (3000)  │
└──────────┘   └─────┬─────┘   └──────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌────────┐  ┌────────┐  ┌────────┐
   │  IAM   │  │  WAF   │  │  NGFW  │  ... 22 services
   └────────┘  └────────┘  └────────┘
        │            │            │
        └────────────┼────────────┘
                     ▼
              ┌──────────┐
              │PostgreSQL│
              └──────────┘
```

## Microservices

| Service | Port | Description |
|---------|------|-------------|
| **IAM** | 3008 | Identity & Access Management |
| **WAF** | 3001 | Web Application Firewall |
| **NGFW** | 3002 | Next-Gen Firewall |
| **SIEM/SOAR** | 3003 | Security Info & Event Management |
| **Vuln Scanner** | 3004 | Vulnerability Assessment |
| **Fraud Detection** | 3005 | Fraud Analytics |
| **Awareness** | 3006 | Phishing Simulation & Training |
| **GRC** | 3007 | Governance, Risk & Compliance |
| **Asset Management** | 3009 | Asset Inventory |
| **Data Security** | 3012 | DLP Policies |
| **CSPM** | 3011 | Cloud Security Posture Mgmt |
| **EDR** | 3015 | Endpoint Detection & Response |
| **Threat Intel** | 3019 | Threat Intelligence Feeds |
| **XDR** | 3016 | Extended Detection & Response |
| **Risk Engine** | 3014 | Risk Scoring (Python) |
| **SOAR** | 3018 | Security Orchestration |
| **Deception** | 3013 | Honeypots & Deception |
| **DevSecOps** | 3020 | CI/CD Security Scanning |
| **BCP/DR** | 3021 | Business Continuity |
| **Password Mgr** | 3022 | Password Management |
| **Data Lake** | 3017 | Security Data Lake |

**Infrastructure**: PostgreSQL (5432), Redis (6379), RabbitMQ (5672/15672), Nginx (80/443)

## Quick Start

```bash
# Start all services
docker compose up -d

# Check health
docker ps

# View logs
docker compose logs -f api-gateway
```

## Access

| Portal | URL | Credentials |
|--------|-----|-------------|
| **Main Dashboard** | http://localhost:3000 | admin / admin123 |
| **GRC Dashboard** | http://localhost:8081 | admin / admin123 |
| **DevSecOps Portal** | http://localhost:9090 | admin / admin123 |
| **API Docs** | http://localhost:3000/api-docs | JWT auth |
| **RabbitMQ UI** | http://localhost:15672 | cybersec / securepassword |

### Auth Headers

```bash
# JWT Token
Authorization: Bearer <token>

# API Key
x-api-key: <key>

# Tenant
x-tenant-id: tenant1

# User-Agent (required - OWASP blocks curl defaults)
User-Agent: Mozilla/5.0
```

**Test JWT** (valid until 2026-06-02):

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyX2FkbWluIiwidGVuYW50SWQiOiJ0ZW5hbnQxIiwicm9sZXMiOlsiYWRtaW4iXSwiaWF0IjoxNzc5Nzc2NjE2LCJleHAiOjE3Nzk4NjMwMTZ9.E6hlrrBXPJ9v1T9gNZdTNUuYXmPfU8MUhqZhYdF2AyA
```

## API

All endpoints are proxied through the API Gateway at `/api/{service}/*`. The gateway handles JWT validation, API key auth, tenant isolation, and rate limiting.

### Example Requests

```bash
TOKEN="Bearer eyJhbGciOiJIUzI1NiIs..."
UA="-H 'User-Agent: Mozilla/5.0'"

# IAM - List users
curl -s $UA -H "Authorization: $TOKEN" http://localhost:3000/api/iam/users

# WAF - List rules
curl -s $UA -H "Authorization: $TOKEN" http://localhost:3000/api/waf/rules

# Vulnerability Scanner - List vulnerabilities
curl -s $UA -H "Authorization: $TOKEN" http://localhost:3000/api/scanner/vulnerabilities

# EDR - List agents
curl -s $UA -H "Authorization: $TOKEN" http://localhost:3000/api/edr/agents

# Fraud - List alerts
curl -s $UA -H "Authorization: $TOKEN" http://localhost:3000/api/fraud/alerts

# Awareness - List campaigns
curl -s $UA -H "Authorization: $TOKEN" http://localhost:3000/api/awareness/api/campaigns

# Risk Engine - Get user risk
curl -s $UA -H "Authorization: $TOKEN" http://localhost:3000/api/risk/human/user_admin

# SIEM - List incidents
curl -s $UA -H "Authorization: $TOKEN" http://localhost:3000/api/siem/incidents
```

## Tech Stack

- **Runtime**: Node.js 18 (21 services), Python 3.11 (risk-engine)
- **Database**: PostgreSQL 15 with 60+ tables
- **Message Queue**: RabbitMQ with AMQP
- **Cache**: Redis 7
- **API Gateway**: Express.js with custom proxy middleware
- **Frontend**: React (port 3000 dashboard, 8081 GRC, 9090 DevSecOps)
- **Reverse Proxy**: Nginx with SSL termination
- **Auth**: JWT + API key + Tenant isolation
- **Container**: Docker Compose with health checks
- **CI/CD**: GitHub Actions (lint, test, build, deploy)

## Development

```bash
# Rebuild a single service
docker compose up -d --build <service-name>

# View service logs
docker compose logs -f <service-name>

# Access PostgreSQL
docker exec -it cybersec-postgres psql -U cybersec -d cybersec_platform

# PostgreSQL connection string
postgresql://cybersec:securepassword@localhost:5432/cybersec_platform
```

### Service Template

Each microservice follows a consistent pattern:

```
service-name/
├── server.js        # Express app with routes
├── package.json     # Dependencies (express, pg, dotenv)
├── Dockerfile       # Multi-stage Alpine build
└── department-scope.js  # Tenant isolation middleware
```

Routes are registered WITHOUT the `/api/{service}` prefix — the gateway strips it via `pathRewrite`. JWT payload uses `camelCase` (`tenantId`, not `tenant_id`).

## Seeded Data

The platform includes 52+ seeded database tables with realistic test data:
- 7 IAM users across 3 tenants
- 20+ WAF rules
- 15+ fraud detection alerts
- 3 EDR agents, CSPM findings, threat IOCs, DLP policies, XDR incidents
- 3 phishing campaigns with results
- 3 risk-engine profiles
- 20+ asset inventory records
- 50+ vulnerability entries
