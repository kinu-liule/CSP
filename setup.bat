@echo off
setlocal enabledelayedexpansion

echo =========================================
echo CyberSec Platform - Setup Script (Windows)
echo =========================================
echo.

REM Check prerequisites
where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not installed. Please install Docker Desktop first.
    exit /b 1
)

where docker-compose >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: docker-compose is not installed. Please install Docker Desktop first.
    exit /b 1
)

REM Create necessary directories
echo Creating directories...
if not exist "api-gateway\logs" mkdir "api-gateway\logs"
if not exist "nginx\ssl" mkdir "nginx\ssl"

REM Copy environment file if not exists
if not exist ".env" (
    echo Creating .env file...
    (
        echo # Database
        echo DB_HOST=localhost
        echo DB_PORT=5432
        echo DB_NAME=cybersec_platform
        echo DB_USER=cybersec
        echo DB_PASSWORD=securepassword
        echo.
        echo # JWT
        echo JWT_SECRET=super-secret-jwt-key-change-in-production
        echo.
        echo # Service URLs
        echo IAM_SERVICE_URL=http://localhost:3008
        echo WAF_SERVICE_URL=http://localhost:3001
        echo NGFW_SERVICE_URL=http://localhost:3002
        echo SIEM_SOAR_SERVICE_URL=http://localhost:3003
        echo VULN_SCANNER_SERVICE_URL=http://localhost:3004
        echo FRAUD_DETECTION_SERVICE_URL=http://localhost:3005
        echo AWARENESS_SERVICE_URL=http://localhost:3006
        echo GRC_SERVICE_URL=http://localhost:3007
        echo.
        echo # Redis
        echo REDIS_URL=redis://localhost:6379
        echo.
        echo # RabbitMQ
        echo RABBITMQ_URL=amqp://cybersec:securepassword@localhost:5672
    ) > .env
    echo Created .env file. Please review and update as needed.
)

REM Build and start services
echo.
echo Building and starting services...
docker-compose build
docker-compose up -d

REM Wait for services to start
echo.
echo Waiting for services to start...
timeout /t 10 /nobreak >nul

REM Check service health
echo.
echo Checking service health...
for %%s in (postgres redis rabbitmq api-gateway iam waf ngfw siem-soar vuln-scanner fraud-detection awareness grc risk-engine frontend) do (
    docker-compose ps %%s 2>nul | find "Up" >nul 2>&1
    if !errorlevel! equ 0 (
        echo ✓ %%s is running
    ) else (
        echo ✗ %%s is not running
    )
)

echo.
echo =========================================
echo Setup complete!
echo =========================================
echo.
echo Access the platform at:
echo   - Frontend: http://localhost:8080
echo   - API Gateway: http://localhost:3000
echo   - API Docs: http://localhost:3000/health
echo.
echo Default credentials:
echo   - Username: admin
echo   - Email: admin@cybersec.com
echo   - Password: admin123
echo.
echo To view logs: docker-compose logs -f [service-name]
echo To stop: docker-compose down
echo.
pause
