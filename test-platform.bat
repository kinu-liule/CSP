@echo off
echo ===================================
echo API Gateway Platform - Test Suite
echo ===================================
echo.

echo Testing API Gateway endpoints...
echo.

echo [1] Testing Health Endpoint...
curl -s http://localhost:3000/health
echo.

echo [2] Testing Tenants API...
curl -s http://localhost:3000/api/tenants
echo.

echo [3] Testing Policies API...
curl -s http://localhost:3000/api/policies | findstr "name"
echo.

echo [4] Testing Analytics Metrics...
curl -s http://localhost:3000/api/analytics/metrics
echo.

echo [5] Testing Services List...
curl -s http://localhost:3000/services
echo.

echo.
echo ===================================
echo All API tests complete!
echo ===================================
echo.
echo Open dashboard in browser:
echo http://localhost:3000/dashboard
echo.
echo Dashboard Features:
echo - Real-time metrics (requests, errors, blocked, response time)
echo - Tenant management (create, view, manage)
echo - API key generation and management
echo - Policy management
echo - Security events viewer
echo.
echo Test credentials:
echo Tenant ID: test-tenant-1
echo API Key: e0d3285cd611a0c1ef4e00c40669551b7052b18be32c72cb2803439e2a71b0b4
echo.
pause
