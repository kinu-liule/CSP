#!/bin/bash
set -e

echo "=========================================="
echo "  CyberSec Platform - Startup Script"
echo "=========================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "[ERROR] Docker is not running! Please start Docker Desktop first."
    exit 1
fi

echo "[1/4] Building all Docker services..."
docker-compose build
if [ $? -ne 0 ]; then
    echo "[ERROR] Build failed! Check the errors above."
    exit 1
fi
echo "✅ Build completed successfully!"
echo ""

echo "[2/4] Starting infrastructure (PostgreSQL, Redis, RabbitMQ)..."
docker-compose up -d postgres redis rabbitmq
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to start infrastructure!"
    exit 1
fi
echo "✅ Infrastructure started!"
echo ""

echo "[3/4] Waiting for PostgreSQL to be healthy..."
until docker-compose exec -T postgres pg_isready -U cybersec > /dev/null 2>&1; do
    echo "Waiting for PostgreSQL..."
    sleep 2
done
echo "✅ PostgreSQL is ready!"
echo ""

echo "[4/4] Initializing database schema..."
docker-compose exec -T postgres psql -U cybersec -d cybersec_platform -f /docker-entrypoint-initdb.d/init.sql > /dev/null 2>&1 || echo "[WARNING] Database may already be initialized."
echo "✅ Database schema initialized!"
echo ""

echo "Starting all services..."
docker-compose up -d
echo ""
echo "=========================================="
echo "  Platform is starting!"
echo "=========================================="
echo ""
echo "🌐 Frontend:      http://localhost:8080"
echo "🚪 API Gateway:    http://localhost:3000"
echo "📊 Login:         admin / admin123 / tenant1"
echo ""
echo "Check status:"
echo "  docker-compose ps"
echo ""
