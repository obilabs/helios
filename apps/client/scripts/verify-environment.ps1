# Helios Environment Verification Script
# Purpose: Verify Docker environment is healthy before starting work
# Usage: .\verify-environment.ps1

Write-Host "`n=== Helios Environment Verification ===" -ForegroundColor Cyan
Write-Host "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n" -ForegroundColor Gray

$script:errors = @()
$script:warnings = @()

# Check 1: Docker Desktop is running
Write-Host "[1/6] Checking Docker Desktop..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK Docker is installed: $dockerVersion" -ForegroundColor Green
    } else {
        $script:errors += "Docker is not running or not installed"
        Write-Host "  ERROR Docker is not running" -ForegroundColor Red
    }
} catch {
    $script:errors += "Docker command failed"
    Write-Host "  ERROR Docker command failed" -ForegroundColor Red
}

# Check 2: Docker containers are running
Write-Host "`n[2/6] Checking Docker containers..." -ForegroundColor Yellow
try {
    $psOutput = docker-compose ps 2>&1
    if ($psOutput -match "helios_client_backend.*Up.*healthy") {
        Write-Host "  OK Backend container is healthy" -ForegroundColor Green
    } else {
        $script:errors += "Backend container is not healthy"
        Write-Host "  ERROR Backend container is not healthy" -ForegroundColor Red
    }

    if ($psOutput -match "helios_client_frontend.*Up.*healthy") {
        Write-Host "  OK Frontend container is healthy" -ForegroundColor Green
    } else {
        $script:errors += "Frontend container is not healthy"
        Write-Host "  ERROR Frontend container is not healthy" -ForegroundColor Red
    }

    if ($psOutput -match "helios_client_postgres.*Up.*healthy") {
        Write-Host "  OK Postgres container is healthy" -ForegroundColor Green
    } else {
        $script:errors += "Postgres container is not healthy"
        Write-Host "  ERROR Postgres container is not healthy" -ForegroundColor Red
    }

    if ($psOutput -match "helios_client_redis.*Up.*healthy") {
        Write-Host "  OK Redis container is healthy" -ForegroundColor Green
    } else {
        $script:errors += "Redis container is not healthy"
        Write-Host "  ERROR Redis container is not healthy" -ForegroundColor Red
    }
} catch {
    $script:errors += "Failed to check container status"
    Write-Host "  ERROR Failed to check containers" -ForegroundColor Red
}

# Check 3: Port conflicts
Write-Host "`n[3/6] Checking for port conflicts..." -ForegroundColor Yellow
$portsToCheck = @(3000, 3001)

foreach ($port in $portsToCheck) {
    $listeners = netstat -ano | Select-String ":$port.*LISTENING"
    if ($listeners) {
        $pidList = $listeners | ForEach-Object {
            if ($_ -match '\s+(\d+)\s*$') {
                $matches[1]
            }
        } | Select-Object -Unique

        $uniquePids = ($pidList | Measure-Object).Count
        if ($uniquePids -le 2) {
            Write-Host "  OK Port $port is in use by $uniquePids process(es)" -ForegroundColor Green
        } else {
            $script:warnings += "Port $port has $uniquePids different listeners"
            Write-Host "  WARN Port $port has $uniquePids different listeners" -ForegroundColor Yellow
        }
    } else {
        $script:warnings += "Port $port is not in use"
        Write-Host "  WARN Port $port is not in use" -ForegroundColor Yellow
    }
}

# Check 4: Backend health
Write-Host "`n[4/6] Checking backend health..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "  OK Backend is healthy (HTTP 200)" -ForegroundColor Green
    } else {
        $script:warnings += "Backend returned HTTP $($response.StatusCode)"
        Write-Host "  WARN Backend returned HTTP $($response.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    $script:errors += "Backend health check failed: $($_.Exception.Message)"
    Write-Host "  ERROR Backend health check failed" -ForegroundColor Red
}

# Check 5: Setup status
Write-Host "`n[5/6] Checking organization setup status..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/organization/setup/status" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json

    if ($data.success -and $data.data.isSetupComplete) {
        Write-Host "  OK Organization is set up and ready" -ForegroundColor Green
        Write-Host "    - Has Organization: $($data.data.hasOrganization)" -ForegroundColor Gray
        Write-Host "    - Has Admin: $($data.data.hasAdmin)" -ForegroundColor Gray
    } else {
        $script:warnings += "Organization setup is not complete"
        Write-Host "  WARN Organization setup is incomplete" -ForegroundColor Yellow
    }
} catch {
    $script:errors += "Setup status check failed: $($_.Exception.Message)"
    Write-Host "  ERROR Setup status check failed" -ForegroundColor Red
}

# Check 6: Frontend accessibility
Write-Host "`n[6/6] Checking frontend..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "  OK Frontend is accessible (HTTP 200)" -ForegroundColor Green

        if ($response.Content -match "root") {
            Write-Host "  OK Frontend HTML looks correct" -ForegroundColor Green
        } else {
            $script:warnings += "Frontend HTML may be incorrect"
            Write-Host "  WARN Frontend HTML may be incorrect" -ForegroundColor Yellow
        }
    } else {
        $script:warnings += "Frontend returned HTTP $($response.StatusCode)"
        Write-Host "  WARN Frontend returned HTTP $($response.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    $script:errors += "Frontend check failed: $($_.Exception.Message)"
    Write-Host "  ERROR Frontend check failed" -ForegroundColor Red
}

# Summary
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "Errors: $($script:errors.Count)" -ForegroundColor $(if ($script:errors.Count -eq 0) { "Green" } else { "Red" })
Write-Host "Warnings: $($script:warnings.Count)" -ForegroundColor $(if ($script:warnings.Count -eq 0) { "Green" } else { "Yellow" })

if ($script:errors.Count -gt 0) {
    Write-Host "`nErrors detected:" -ForegroundColor Red
    $script:errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

if ($script:warnings.Count -gt 0) {
    Write-Host "`nWarnings:" -ForegroundColor Yellow
    $script:warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}

if ($script:errors.Count -eq 0 -and $script:warnings.Count -eq 0) {
    Write-Host "`nOK Environment is healthy and ready!" -ForegroundColor Green
    Write-Host "`nYou can:" -ForegroundColor Cyan
    Write-Host "  - Open browser: http://localhost:3000" -ForegroundColor Gray
    Write-Host "  - Run tests: npx playwright test" -ForegroundColor Gray
    Write-Host "  - View logs: docker-compose logs -f" -ForegroundColor Gray
    exit 0
} elseif ($script:errors.Count -eq 0) {
    Write-Host "`nWARN Environment has warnings but should work" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "`nERROR Environment has errors - please fix before continuing" -ForegroundColor Red
    Write-Host "`nSuggested fixes:" -ForegroundColor Cyan
    Write-Host "  1. Start Docker Desktop" -ForegroundColor Gray
    Write-Host "  2. Run: docker-compose up -d" -ForegroundColor Gray
    Write-Host "  3. Wait 30 seconds for services to start" -ForegroundColor Gray
    Write-Host "  4. Run this script again" -ForegroundColor Gray
    exit 1
}
