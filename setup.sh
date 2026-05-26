#!/bin/bash
set -e

echo "========================================="
echo "CyberSec Platform - Setup Script"
echo "========================================="
echo ""

# Check prerequisites
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo "ERROR: $1 is not installed. Please install it first."
        exit 1
    fi
}

echo "Checking prerequisites..."
check_command docker
check_command docker-compose

# Create necessary directories
echo "Creating directories..."
mkdir -p api-gateway/logs
mkdir -p nginx/ssl

# Copy environment file if not exists
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env << EOF
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cybersec_platform
DB_USER=cybersec
DB_PASSWORD=securepassword

# JWT
JWT_SECRET=super-secret-jwt-key-change-in-production

# Service URLs
IAM_SERVICE_URL=http://localhost:3008
WAF_SERVICE_URL=http://localhost:3001
NGFW_SERVICE_URL=http://localhost:3002
SIEM_SOAR_SERVICE_URL=http://localhost:3003
VULN_SCANNER_SERVICE_URL=http://localhost:3004
FRAUD_DETECTION_SERVICE_URL=http://localhost:3005
AWARENESS_SERVICE_URL=http://localhost:3006
GRC_SERVICE_URL=http://localhost:3007

# Redis
REDIS_URL=redis://localhost:6379

# RabbitMQ
RABBITMQ_URL=amqp://cybersec:securepassword@localhost:5672
EOF
    echo "Created .env file. Please review and update as needed."
fi

# Build and start services
echo ""
echo "Building and starting services..."
docker-compose build
docker-compose up -d

# Wait for services to be healthy
echo ""
echo "Waiting for services to start..."
sleep 10

# Check service health
echo ""
echo "Checking service health..."
services=("postgres" "redis" "rabbitmq" "api-gateway" "iam" "waf" "ngfw" "siem-soar" "vuln-scanner" "fraud-detection" "awareness" "grc" "risk-engine" "frontend")

for service in "${services[@]}"; do
    if docker-compose ps $service | grep -q "Up"; then
        echo "✓ $service is running"
    else
        echo "✗ $service is not running"
    fi
done

echo ""
echo "========================================="
echo "Setup complete!"
echo "========================================="
echo ""
echo "Access the platform at:"
echo "  - Frontend: http://localhost:8080"
echo "  - API Gateway: http://localhost:3000"
echo "  - API Docs: http://localhost:3000/health"
echo ""
echo "Default credentials:"
echo "  - Username: admin"
echo "  - Email: admin@cybersec.com"
echo "  - Password: admin123"
echo ""
echo "To view logs: docker-compose logs -f [service-name]"
echo "To stop: docker-compose down"
echo ""
