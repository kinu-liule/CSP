@echo off
echo Building Docker images...
docker-compose build > build-output.log 2>&1
if errorlevel 1 (
    echo [ERROR] Build failed! Check build-output.log
    type build-output.log | find "ERROR"
    pause
    exit /b 1
)
echo Build completed! Showing images...
docker images | find "cybersec"
pause
