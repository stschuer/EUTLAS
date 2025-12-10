# EUTLAS Development Setup Script (Windows PowerShell)
# Run with: .\setup.ps1

Write-Host "🚀 Setting up EUTLAS development environment..." -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
function Test-Command {
    param($Command)
    try {
        if (Get-Command $Command -ErrorAction Stop) {
            Write-Host "✅ $Command found" -ForegroundColor Green
            return $true
        }
    } catch {
        Write-Host "❌ $Command is required but not installed" -ForegroundColor Red
        return $false
    }
}

Write-Host "Checking prerequisites..." -ForegroundColor Yellow
$nodeOk = Test-Command "node"
$pnpmOk = Test-Command "pnpm"
$dockerOk = Test-Command "docker"

if (-not ($nodeOk -and $pnpmOk -and $dockerOk)) {
    Write-Host ""
    Write-Host "Please install missing prerequisites:" -ForegroundColor Red
    if (-not $nodeOk) { Write-Host "  - Node.js 20+: https://nodejs.org/" }
    if (-not $pnpmOk) { Write-Host "  - pnpm: npm install -g pnpm" }
    if (-not $dockerOk) { Write-Host "  - Docker Desktop: https://docker.com/products/docker-desktop" }
    exit 1
}

# Check Node version
$nodeVersion = (node -v).TrimStart('v').Split('.')[0]
if ([int]$nodeVersion -lt 20) {
    Write-Host "❌ Node.js 20+ is required. Current version: $(node -v)" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Node.js version: $(node -v)" -ForegroundColor Green

# Install dependencies
Write-Host ""
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
pnpm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Build shared package
Write-Host ""
Write-Host "🔨 Building shared types..." -ForegroundColor Yellow
Push-Location shared
pnpm build
Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to build shared package" -ForegroundColor Red
    exit 1
}

# Setup environment files
Write-Host ""
Write-Host "⚙️  Setting up environment files..." -ForegroundColor Yellow

if (-not (Test-Path "backend\.env")) {
    Copy-Item "backend\env.development" "backend\.env"
    Write-Host "✅ Created backend\.env from env.development" -ForegroundColor Green
} else {
    Write-Host "⏭️  backend\.env exists, skipping" -ForegroundColor Gray
}

if (-not (Test-Path "frontend\.env.local")) {
    Copy-Item "frontend\env.development" "frontend\.env.local"
    Write-Host "✅ Created frontend\.env.local from env.development" -ForegroundColor Green
} else {
    Write-Host "⏭️  frontend\.env.local exists, skipping" -ForegroundColor Gray
}

# Start MongoDB with Docker
Write-Host ""
Write-Host "🐳 Starting MongoDB..." -ForegroundColor Yellow

# Check if Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop and try again." -ForegroundColor Red
    exit 1
}

docker compose up -d mongodb

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start MongoDB" -ForegroundColor Red
    exit 1
}

Write-Host "✅ MongoDB started" -ForegroundColor Green

# Wait for MongoDB to be ready
Write-Host ""
Write-Host "⏳ Waiting for MongoDB to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Development environment setup complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Start the backend:  pnpm dev:backend"
Write-Host "  2. Start the frontend: pnpm dev:frontend"
Write-Host "  3. Or both together:   pnpm dev"
Write-Host ""
Write-Host "📚 API Docs: http://localhost:4000/docs"
Write-Host "🌐 Frontend: http://localhost:3000"
Write-Host ""

