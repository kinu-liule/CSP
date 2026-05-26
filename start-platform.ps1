# Start Cybersecurity Platform - Development Mode
Write-Host "Starting Cybersecurity Platform..." -ForegroundColor Green

# Check if RabbitMQ is running
Write-Host "Checking RabbitMQ..." -ForegroundColor Yellow
$rabbitmq = docker ps --filter "name=rabbitmq" --format "{{.Names}}"
if (-not $rabbitmq) {
    Write-Host "Starting RabbitMQ..." -ForegroundColor Cyan
    docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 -e RABBITMQ_DEFAULT_USER=admin -e RABBITMQ_DEFAULT_PASS=securepassword rabbitmq:3-management
    Start-Sleep -Seconds 10
}

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm run install:all

# Start services in background
Write-Host "Starting services..." -ForegroundColor Green

$services = @(
    @{ Name = "API Gateway"; Path = "api-gateway"; Port = 3000 },
    @{ Name = "WAF"; Path = "services/waf"; Port = 3001 },
    @{ Name = "NGFW"; Path = "services/ngfw"; Port = 3002 },
    @{ Name = "SIEM/SOAR"; Path = "services/siem-soar"; Port = 3003 },
    @{ Name = "Vuln Scanner"; Path = "services/vuln-scanner"; Port = 3004 },
    @{ Name = "Fraud Detection"; Path = "services/fraud-detection"; Port = 3005 },
    @{ Name = "Awareness"; Path = "services/awareness"; Port = 3006 },
    @{ Name = "GRC"; Path = "services/grc"; Port = 3007 },
    @{ Name = "IAM"; Path = "services/iam"; Port = 3008 }
)

foreach ($svc in $services) {
    Write-Host "Starting $($svc.Name) on port $($svc.Port)..." -ForegroundColor Cyan
    Start-Process -FilePath "powershell" -ArgumentList "-NoProfile -Command `"cd '$((Get-Location).Path)/$($svc.Path)'; npm start`"" -WindowStyle Normal
    Start-Sleep -Milliseconds 500
}

Write-Host "`n✅ Platform started!" -ForegroundColor Green
Write-Host "`nServices running:" -ForegroundColor Yellow
Write-Host "  API Gateway: http://localhost:3000" -ForegroundColor White
Write-Host "  RabbitMQ Management: http://localhost:15672 (admin/securepassword)" -ForegroundColor White
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. Create a tenant: POST http://localhost:3000/tenants" -ForegroundColor White
Write-Host "  2. Run tests: npm test" -ForegroundColor White
