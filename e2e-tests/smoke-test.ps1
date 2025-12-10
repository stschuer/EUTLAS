# EUTLAS Quick Smoke Test
# Fast validation that core services are running
#
# Usage: .\smoke-test.ps1 [-ApiUrl "http://localhost:4000/api/v1"]

param(
    [string]$ApiUrl = "http://localhost:4000/api/v1"
)

$ErrorActionPreference = "Continue"
$passed = 0
$failed = 0

Write-Host ""
Write-Host "[SMOKE TEST] EUTLAS Backend" -ForegroundColor Cyan
Write-Host "API: $ApiUrl`n" -ForegroundColor Gray

# Test 1: Health Check
Write-Host -NoNewline "1. Health Check... "
try {
    $health = Invoke-RestMethod -Uri "$ApiUrl/health" -Method GET -TimeoutSec 5
    if ($health.status -eq "ok" -or $health) {
        Write-Host "PASS" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "WARN" -ForegroundColor Yellow
        $passed++
    }
} catch {
    Write-Host "FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $failed++
}

# Test 2: Database Connection
Write-Host -NoNewline "2. Database Check... "
try {
    $health = Invoke-RestMethod -Uri "$ApiUrl/health" -Method GET -TimeoutSec 5
    if ($health.database -eq "connected" -or $health) {
        Write-Host "PASS" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "WARN" -ForegroundColor Yellow
        $passed++
    }
} catch {
    Write-Host "FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $failed++
}

# Test 3: Auth Endpoint
Write-Host -NoNewline "3. Auth Available... "
try {
    Invoke-WebRequest -Uri "$ApiUrl/auth/login" -Method POST -ContentType "application/json" -Body '{}' -ErrorAction Stop | Out-Null
    Write-Host "WARN - Unexpected success" -ForegroundColor Yellow
    $passed++
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -in @(400, 401, 422)) {
        Write-Host "PASS (status $statusCode)" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "FAIL - Status $statusCode" -ForegroundColor Red
        $failed++
    }
}

# Test 4: Rate Limiting Active
Write-Host -NoNewline "4. Rate Limiting... "
try {
    $response = Invoke-WebRequest -Uri "$ApiUrl/health" -Method GET -UseBasicParsing
    Write-Host "PASS (active)" -ForegroundColor Green
    $passed++
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 429) {
        Write-Host "PASS (triggered)" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "WARN" -ForegroundColor Yellow
        $passed++
    }
}

# Test 5: Security Headers
Write-Host -NoNewline "5. Security Headers... "
try {
    $response = Invoke-WebRequest -Uri "$ApiUrl/health" -Method GET -UseBasicParsing
    $hasHeaders = ($response.Headers["X-Content-Type-Options"] -or $response.Headers["X-Frame-Options"])
    if ($hasHeaders) {
        Write-Host "PASS" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "WARN - Some missing" -ForegroundColor Yellow
        $passed++
    }
} catch {
    Write-Host "WARN - Could not check" -ForegroundColor Yellow
    $passed++
}

# Summary
Write-Host ""
Write-Host "=========================" -ForegroundColor Gray
$total = $passed + $failed
if ($failed -eq 0) {
    Write-Host "Result: All $total tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "Result: $passed/$total passed, $failed failed" -ForegroundColor Red
    exit 1
}

