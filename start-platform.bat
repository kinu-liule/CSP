@echo off
cd "C:\Users\Arbaj Khan LLC\Documents\all-in-on CS Solution\cybersec-platform"
echo Starting Docker containers...
docker-compose up -d
echo.
echo Checking container status...
docker-compose ps
pause
