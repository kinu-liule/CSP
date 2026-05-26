# Quick Start Guide - CyberSec Platform

## Prerequisites
- **Docker Desktop** installed and running ✅
- **Git** (optional)

---

## Step 1: Start Docker Desktop
Make sure Docker Desktop is running before proceeding.

---

## Step 2: Run the Startup Script

### Windows (PowerShell or Command Prompt):
```bash
cd "C:\Users\Arbaj Khan LLC\Documents\all-in-on CS Solution\cybersec-platform"
.\start-all-services.bat
```

### Linux/macOS:
```bash
cd "/c/Users/Arbaj Khan LLC/Documents/all-in-on CS Solution/cybersec-platform"
chmod +x start-all-services.sh
./start-all-services.sh
```

---

## Step 3: Access the Platform

After all services start:
- **Dashboard:** http://localhost:8080
- **API Gateway:** http://localhost:3000
- **Health Check:** http://localhost:3000/health

### Default Login Credentials:
| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin123` |
| Tenant ID | `tenant1` |

---

## Step 4: Verify Services

Check running services:
```bash
docker-compose ps
```

You should see 20+ services running:
- api-gateway (port 3000)
- iam (3008), waf (3001), ngfw (3002), siem-soar (3003)
- vuln-scanner (3004), fraud-detection (3005), awareness (3006), grc (3007)
- **New services:** asset-management (3009), cspm (3011), edr (3015), threat-intel (3019), soar (3018), data-security (3012), data-lake (3017), xdr (3020), devsecops (3014), deception (3013), password-manager (3016), business-continuity (3010)
- risk-engine (8000)
- Frontend (8080), Nginx (80)
- PostgreSQL (5432), Redis (6379), RabbitMQ (5672, 15672)

---

## Step 5: Explore the Dashboard

1. Login at http://localhost:8080/login
2. Dashboard shows **20+ service cards**
3. Click any service to view its dashboard:
   - **Original 8:** WAF, NGFW, SIEM/SOAR, Vulnerabilities, Fraud, Awareness, GRC, Risk Engine
   - **New 12:** Asset Mgmt, CSPM, EDR, Threat Intel, SOAR, Data Security, Data Lake, XDR, DevSecOps, Deception, Password Manager, Business Continuity

---

## Troubleshooting

### Services won't start:
```bash
# Check Docker is running
docker info

# Rebuild specific service
docker-compose up -d --build api-gateway

# Check logs
docker-compose logs -f api-gateway
```

### Database connection issues:
```bash
# Connect to database
docker-compose exec postgres psql -U cybersec -d cybersec_platform

# Check tables
\dt  # List tables
\q   # Quit
```

### Reset everything:
```bash
docker-compose down -v
docker-compose up -d --build
```

---

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│            Nginx Reverse Proxy (Port 80)           │
└──────────────────┬───────────────────────────────┘
                           │
          ┌────────────┴────────────┐
          │                       │
    ┌─────▼────┐          ┌─────▼────┐
    │ Frontend │          │ API Gateway│
    │  (8080)  │          │  (3000)   │
    └──────────┘          └─────┬─────┘
                                │
        ┌────────────────────┼────────────────────┐
        │        │           │           │        │
    ┌──▼──┐  ┌──▼──┐  ┌──▼──┐  ┌──▼──┐
    │ IAM │  │ WAF │  │NGFW│  │SIEM│ ...20+ services
    │:3008│  │:3001│  │:3002│  │:3003│
    └─────┘  └─────┘  └─────┘  └─────┘
        │           │           │           │
        └───────────┴───────────┴───────────┘
                                │
                          ┌─────▼─────┐
                          │ PostgreSQL │
                          │  :5432    │
                          └───────────┘
                                │
                    ┌───────────┴───────────┐
                    │ Redis (6379)  RabbitMQ (5672) │
                    └────────────────────────────┘
```

---

## Tech Stack Summary
- **Backend:** Node.js 18, Express.js, PostgreSQL 16, Redis 7, RabbitMQ 3
- **Frontend:** React 18, React Router 6, Bootstrap 5
- **Risk Engine:** Python 3.11, FastAPI, Uvicorn
- **Infra:** Docker, Docker Compose, Nginx Alpine

---

## Need Help?
1. Check service logs: `docker-compose logs -f [service-name]`
2. Restart service: `docker-compose restart [service-name]`
3. Rebuild: `docker-compose up -d --build [service-name]`

---

**Status: ✅ Ready to Launch! 🚀**
