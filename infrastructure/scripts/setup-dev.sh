#!/bin/bash
# EUTLAS Development Environment Setup Script

set -e

echo "🚀 Setting up EUTLAS development environment..."

# Check prerequisites
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ $1 is required but not installed."
        exit 1
    fi
    echo "✅ $1 found"
}

echo ""
echo "Checking prerequisites..."
check_command node
check_command pnpm
check_command docker

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20+ is required. Current version: $(node -v)"
    exit 1
fi
echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
pnpm install

# Build shared package
echo ""
echo "🔨 Building shared types..."
cd shared
pnpm build
cd ..

# Setup environment files
echo ""
echo "⚙️  Setting up environment files..."

if [ ! -f backend/.env ]; then
    cp backend/env.example backend/.env
    echo "✅ Created backend/.env from example"
else
    echo "⏭️  backend/.env already exists, skipping"
fi

if [ ! -f frontend/.env.local ]; then
    echo "NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1" > frontend/.env.local
    echo "✅ Created frontend/.env.local"
else
    echo "⏭️  frontend/.env.local already exists, skipping"
fi

# Start MongoDB with Docker
echo ""
echo "🐳 Starting MongoDB..."
docker compose up -d mongodb

echo ""
echo "✅ Development environment setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start the backend:  pnpm dev:backend"
echo "  2. Start the frontend: pnpm dev:frontend"
echo "  3. Or both together:   pnpm dev"
echo ""
echo "📚 API Docs: http://localhost:4000/docs"
echo "🌐 Frontend: http://localhost:3000"



