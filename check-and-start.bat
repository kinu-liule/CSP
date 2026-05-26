@echo off
echo Checking Docker images...
docker images | findstr cybersec
if errorlevel 1 (
    echo No cybersec images found! Trying build again...
    docker-compose build
) else (
    echo Found cybersec images! Starting infra...
    docker-compose up -d postgres redis rabbitmq
)
pause
