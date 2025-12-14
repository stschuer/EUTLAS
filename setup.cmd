@echo off
REM EUTLAS Development Setup Script (Windows CMD)
REM Run with: setup.cmd

echo.
echo ========================================
echo   EUTLAS Development Setup
echo ========================================
echo.

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed
    echo Please install Node.js 20+ from https://nodejs.org/
    exit /b 1
)
echo [OK] Node.js found

REM Check pnpm
where pnpm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] pnpm is not installed
    echo Please install pnpm: npm install -g pnpm
    exit /b 1
)
echo [OK] pnpm found

REM Check Docker
where docker >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker is not installed
    echo Please install Docker Desktop from https://docker.com/
    exit /b 1
)
echo [OK] Docker found

echo.
echo Installing dependencies...
call pnpm install

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install dependencies
    exit /b 1
)

echo.
echo Building shared types...
cd shared
call pnpm build
cd ..

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to build shared package
    exit /b 1
)

echo.
echo Starting MongoDB...
docker compose up -d mongodb

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to start MongoDB
    echo Make sure Docker Desktop is running
    exit /b 1
)

echo.
echo Waiting for MongoDB to be ready...
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo Next steps:
echo   1. Start backend:  pnpm dev:backend
echo   2. Start frontend: pnpm dev:frontend
echo   3. Or both:        pnpm dev
echo.
echo API Docs: http://localhost:4000/docs
echo Frontend: http://localhost:3000
echo.




