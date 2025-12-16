# EUTLAS Repository Cleanup Script
# This script removes build artifacts, temporary files, and other unnecessary files

Write-Host "Cleaning EUTLAS repository..." -ForegroundColor Cyan

$removedCount = 0
$removedSize = 0

function Remove-ItemSafely {
    param(
        [string]$Path,
        [string]$Description
    )
    
    if (Test-Path $Path) {
        $item = Get-Item $Path -ErrorAction SilentlyContinue
        if ($item) {
            $size = if ($item.PSIsContainer) {
                $sum = (Get-ChildItem $Path -Recurse -ErrorAction SilentlyContinue | 
                       Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
                if ($null -eq $sum) { 0 } else { $sum }
            } else {
                if ($item.Length) { $item.Length } else { 0 }
            }
            
            Remove-Item $Path -Recurse -Force -ErrorAction SilentlyContinue
            $script:removedCount++
            $script:removedSize += ($size / 1MB)
            Write-Host "  [OK] Removed: $Description" -ForegroundColor Green
        }
    }
}

# Build artifacts and dependencies
Write-Host "`nRemoving build artifacts and dependencies..." -ForegroundColor Yellow
Remove-ItemSafely "node_modules" "node_modules directories"
Remove-ItemSafely ".next" "Next.js build output"
Remove-ItemSafely "dist" "TypeScript build output"
Remove-ItemSafely "build" "Build directories"
Remove-ItemSafely ".turbo" "Turborepo cache"
Remove-ItemSafely ".pnpm-store" "pnpm store"
# Note: pnpm-lock.yaml should be kept - it's a lock file that should be committed

# Frontend specific
Write-Host "`nCleaning frontend artifacts..." -ForegroundColor Yellow
Get-ChildItem -Path . -Recurse -Directory -Filter ".next" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "Next.js build: $($_.FullName)"
}
Get-ChildItem -Path . -Recurse -Directory -Filter ".vercel" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "Vercel cache: $($_.FullName)"
}

# Backend specific
Write-Host "`nCleaning backend artifacts..." -ForegroundColor Yellow
Get-ChildItem -Path . -Recurse -Directory -Filter "dist" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "Backend build: $($_.FullName)"
}

# Log files
Write-Host "`nRemoving log files..." -ForegroundColor Yellow
Get-ChildItem -Path . -Recurse -Filter "*.log" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "Log file: $($_.Name)"
}
Get-ChildItem -Path . -Recurse -Filter "npm-debug.log*" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "npm debug log: $($_.Name)"
}
Get-ChildItem -Path . -Recurse -Filter "yarn-debug.log*" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "yarn debug log: $($_.Name)"
}
Get-ChildItem -Path . -Recurse -Filter "pnpm-debug.log*" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "pnpm debug log: $($_.Name)"
}

# Environment files (keep .env.example, remove actual .env files)
Write-Host "`nCleaning environment files..." -ForegroundColor Yellow
Get-ChildItem -Path . -Recurse -Filter ".env" -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -ne ".env.example" -and $_.Name -ne ".env.development" -and $_.Name -ne ".env.production" -and $_.Name -notlike "*.example"
} | ForEach-Object {
    Remove-ItemSafely $_.FullName "Environment file: $($_.Name)"
}

# Coverage and test artifacts
Write-Host "`nCleaning test artifacts..." -ForegroundColor Yellow
Remove-ItemSafely "coverage" "Test coverage reports"
Get-ChildItem -Path . -Recurse -Directory -Filter "coverage" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "Coverage: $($_.FullName)"
}
Get-ChildItem -Path . -Recurse -Directory -Filter ".nyc_output" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "NYC output: $($_.FullName)"
}
Get-ChildItem -Path . -Recurse -Directory -Filter "playwright-report" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "Playwright report: $($_.FullName)"
}
Get-ChildItem -Path . -Recurse -Directory -Filter "test-results" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "Test results: $($_.FullName)"
}

# OS-specific files
Write-Host "`nRemoving OS-specific files..." -ForegroundColor Yellow
Get-ChildItem -Path . -Recurse -Filter ".DS_Store" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "macOS file: $($_.Name)"
}
Get-ChildItem -Path . -Recurse -Filter "Thumbs.db" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "Windows file: $($_.Name)"
}
Get-ChildItem -Path . -Recurse -Filter "desktop.ini" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "Windows file: $($_.Name)"
}

# IDE files
Write-Host "`nRemoving IDE files..." -ForegroundColor Yellow
Get-ChildItem -Path . -Recurse -Directory -Filter ".vscode" -ErrorAction SilentlyContinue | ForEach-Object {
    # Keep settings.json but remove other files
    $settingsPath = Join-Path $_.FullName "settings.json"
    if (Test-Path $settingsPath) {
        $settings = Get-Content $settingsPath -Raw
        Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
        New-Item -ItemType Directory -Path $_.FullName -Force | Out-Null
        Set-Content -Path $settingsPath -Value $settings
        Write-Host "  [OK] Cleaned VSCode folder (kept settings.json): $($_.FullName)" -ForegroundColor Green
    } else {
        Remove-ItemSafely $_.FullName "VSCode folder: $($_.FullName)"
    }
}
Get-ChildItem -Path . -Recurse -Directory -Filter ".idea" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "IntelliJ IDEA folder: $($_.FullName)"
}
Get-ChildItem -Path . -Recurse -Filter "*.swp" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "Vim swap: $($_.Name)"
}
Get-ChildItem -Path . -Recurse -Filter "*.swo" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "Vim swap: $($_.Name)"
}
Get-ChildItem -Path . -Recurse -Filter "*~" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "Backup file: $($_.Name)"
}

# Docker
Write-Host "`nCleaning Docker artifacts..." -ForegroundColor Yellow
Get-ChildItem -Path . -Recurse -Filter ".dockerignore.bak" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "Docker backup: $($_.Name)"
}

# Temporary files
Write-Host "`nRemoving temporary files..." -ForegroundColor Yellow
Get-ChildItem -Path . -Recurse -Filter "*.tmp" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "Temp file: $($_.Name)"
}
Get-ChildItem -Path . -Recurse -Filter "*.temp" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "Temp file: $($_.Name)"
}

# TypeScript build info
Write-Host "`nRemoving TypeScript build info..." -ForegroundColor Yellow
Get-ChildItem -Path . -Recurse -Filter "*.tsbuildinfo" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-ItemSafely $_.FullName "TypeScript build info: $($_.Name)"
}

# Summary
Write-Host "`n" -NoNewline
Write-Host "Cleanup complete!" -ForegroundColor Green
Write-Host "   Removed $removedCount items" -ForegroundColor Cyan
Write-Host "   Freed $([math]::Round($removedSize, 2)) MB" -ForegroundColor Cyan
Write-Host "`nTip: Run 'pnpm install' to restore dependencies" -ForegroundColor Yellow
