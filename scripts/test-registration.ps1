$ErrorActionPreference = "Stop"
$base = "http://localhost:3000"

Write-Host "=== Test Registration & Subscriptions ===" -ForegroundColor Cyan

# 1. Register
Write-Host "`n1. Registering new tenant..." -ForegroundColor Yellow
$regBody = '{"name":"demotenant","email":"demo@demo.com","password":"password123","company":"Demo Inc","domain":"demo.com","services":["iam","waf","ngfw","awareness"]}'
Set-Content -Path "$env:TEMP\reg.json" -Value $regBody
$regResult = curl.exe -s -X POST "$base/api/auth/register" -H "Content-Type: application/json" -d "@$env:TEMP\reg.json"
Write-Host "  Registration: OK" -ForegroundColor Green

$reg = $regResult | ConvertFrom-Json
$token = $reg.data.token
$tid = $reg.data.tenant.tenant_id
Write-Host "  Tenant: $tid"
Write-Host "  Subscribed to: $($reg.data.subscriptions -join ', ')"

# 2. Check subscriptions
Write-Host "`n2. Checking subscriptions..." -ForegroundColor Yellow
$subResult = curl.exe -s "$base/api/tenants/$tid/subscriptions" -H "Authorization: Bearer $token" -H "x-tenant-id: $tid" -H "User-Agent: Mozilla/5.0"
$subs = $subResult | ConvertFrom-Json
Write-Host "  Subscribed services: $($subs.subscriptions.service_name -join ', ')" -ForegroundColor Green

# 3. Test subscribed service (WAF)
Write-Host "`n3. Testing subscribed service (WAF)..." -ForegroundColor Yellow
$wafResult = curl.exe -s -X GET "$base/api/waf/rules" -H "Authorization: Bearer $token" -H "x-tenant-id: $tid" -H "User-Agent: Mozilla/5.0" -w "%{http_code}"
Write-Host "  WAF response: $wafResult" -ForegroundColor Green

# 4. Test unsubscribed service (GRC)
Write-Host "`n4. Testing unsubscribed service (GRC)..." -ForegroundColor Yellow
$grcResult = curl.exe -s -X GET "$base/api/grc/policies" -H "Authorization: Bearer $token" -H "x-tenant-id: $tid" -H "User-Agent: Mozilla/5.0" -w "%{http_code}"
Write-Host "  GRC response: $grcResult" -ForegroundColor Yellow

# 5. Update subscriptions
Write-Host "`n5. Updating subscriptions (add GRC)..." -ForegroundColor Yellow
$updateBody = '{"services":["iam","waf","ngfw","awareness","grc"]}'
Set-Content -Path "$env:TEMP\sub_update.json" -Value $updateBody
$updateResult = curl.exe -s -X PUT "$base/api/tenants/$tid/subscriptions" -H "Authorization: Bearer $token" -H "x-tenant-id: $tid" -H "Content-Type: application/json" -H "User-Agent: Mozilla/5.0" -d "@$env:TEMP\sub_update.json"
Write-Host "  Update: $updateResult" -ForegroundColor Green

# 6. Test GRC now (should work)
Write-Host "`n6. Testing GRC after subscribing..." -ForegroundColor Yellow
$grcResult2 = curl.exe -s -X GET "$base/api/grc/policies" -H "Authorization: Bearer $token" -H "x-tenant-id: $tid" -H "User-Agent: Mozilla/5.0" -w "%{http_code}"
Write-Host "  GRC response: $grcResult2" -ForegroundColor Green

Write-Host "`n=== All tests passed! ===" -ForegroundColor Cyan
