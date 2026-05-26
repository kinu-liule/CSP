# API Gateway Platform - Windows Setup

## Current Status
Docker Desktop is running in Windows containers mode. To use Docker Compose, you need to switch to Linux containers.

## Option 1: Switch Docker to Linux Containers (Recommended)

1. **Right-click Docker Desktop icon in system tray**
2. **Select "Switch to Linux containers..."**
3. **Wait for Docker to restart**
4. **Run the setup:**
   ```bash
   docker-compose up -d --build
   ```

## Option 2: Local Setup (Without Docker)

### Prerequisites
- Node.js 18+ installed
- PostgreSQL installed and running

### Steps
1. **Install dependencies:**
   ```bash
   cd api-gateway
   npm install
   ```

2. **Setup PostgreSQL database:**
   ```bash
   createdb api_gateway
   psql api_gateway < api-gateway/db/schema.sql
   ```

3. **Configure environment:**
   Create `api-gateway/.env`:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=api_gateway
   DB_USER=postgres
   DB_PASSWORD=your_password
   JWT_SECRET=super-secret-jwt-key
   ```

4. **Start the server:**
   ```bash
   cd api-gateway
   npm start
   ```

5. **Access the dashboard:**
   - Dashboard: http://localhost:3000/dashboard
   - Health: http://localhost:3000/health

## Option 3: Quick Start Script

Run the provided script:
```bash
setup.bat
```

This will:
- Check prerequisites
- Install npm dependencies
- Setup PostgreSQL database
- Start the API Gateway

## Access Points

Once running:
- **Dashboard:** http://localhost:3000/dashboard
- **API Gateway:** http://localhost:3000
- **Health Check:** http://localhost:3000/health
- **Metrics:** http://localhost:3000/api/analytics/metrics

## Troubleshooting

### Docker Issues
If Docker Linux containers don't work:
- Restart Docker Desktop
- Ensure WSL2 is installed (run `wsl --install` in PowerShell as admin)
- Check Docker Desktop settings → General → "Use WSL 2 instead of Hyper-V"

### PostgreSQL Issues
- Default user: `postgres`
- Default port: `5432`
- Update `.env` with your actual password
