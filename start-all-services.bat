@echo off
echo ==========================================
echo   CyberSec Platform - Startup Script
echo ==========================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running! Please start Docker Desktop first.
    pause
    exit /b 1
)

echo [1/4] Building all Docker services...
docker-compose build
if errorlevel 1 (
    echo [ERROR] Build failed! Check the errors above.
    pause
    exit /b 1
)
echo ✅ Build completed successfully!
echo.

echo [2/4] Starting infrastructure (PostgreSQL, Redis, RabbitMQ)...
docker-compose up -d postgres redis rabbitmq
if errorlevel 1 (
    echo [ERROR] Failed to start infrastructure!
    pause
    exit /b 1
)
echo ✅ Infrastructure started!
echo.

echo [3/4] Waiting for PostgreSQL to be healthy...
:wait_loop
timeout /t 2 /nobreak >nul 2>&1
docker-compose exec postgres pg_isready -U cybersec >nul 2>&1
if errorlevel 1 (
    echo Waiting for PostgreSQL...
    goto wait_loop
)
echo ✅ PostgreSQL is ready!
echo.

echo [4/4] Initializing database schema...
docker-compose exec -T postgres psql -U cybersec -d cybersec_platform -f /docker-entrypoint-initdb.d/init.sql >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Database initialization failed or already initialized.
) else (
    echo ✅ Database schema created!
)
echo.

echo Starting all services...
docker-compose up -d
echo.
echo ==========================================
echo   Platform is starting!
echo ==========================================
echo.
echo 🌐 Frontend:      http://localhost:8080
echo 🚪 API Gateway:    http://localhost:3000
echo 📊 Login:         admin / admin123 / tenant1
echo.
echo Check status:
echo   docker-compose ps
echo.
pause
