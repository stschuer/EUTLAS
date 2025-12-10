# 🇪🇺 EUTLAS - EU MongoDB Atlas

**Managed MongoDB clusters on European infrastructure.**

EUTLAS is a self-hosted MongoDB-as-a-Service platform, similar to MongoDB Atlas, but running entirely on European infrastructure (Hetzner). It provides a complete control plane for provisioning, managing, and monitoring MongoDB clusters.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EUTLAS Platform                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   Frontend   │───▶│   Backend    │───▶│  Kubernetes Cluster  │  │
│  │  (Next.js)   │    │  (NestJS)    │    │  (MongoDB Operator)  │  │
│  └──────────────┘    └──────────────┘    └──────────────────────┘  │
│         │                   │                       │               │
│         │                   ▼                       ▼               │
│         │            ┌──────────────┐    ┌──────────────────────┐  │
│         │            │   Meta-DB    │    │   Customer Clusters   │  │
│         │            │  (MongoDB)   │    │      (MongoDB)        │  │
│         │            └──────────────┘    └──────────────────────┘  │
│         │                                                           │
│         └─────────────────────────────────────────────────────────▶│
│                              User Interface                         │
└─────────────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
EUTLAS/
├── frontend/           # Next.js 14 Dashboard
├── backend/            # NestJS Control Plane API
├── shared/             # Shared TypeScript types & validators
├── infrastructure/     # Kubernetes & Terraform configs
│   ├── kubernetes/     # K8s manifests & Kustomize
│   └── terraform/      # Hetzner infrastructure
├── docs/               # Documentation
└── docker-compose.yml  # Local development setup
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose

### Development Setup

**Quick Setup (Windows):**
```powershell
# Run the setup script
.\setup.ps1

# Or use CMD
setup.cmd
```

**Manual Setup:**
```bash
# Install dependencies
pnpm install

# Build shared types
cd shared && pnpm build && cd ..

# Copy environment files
copy backend\env.development backend\.env
copy frontend\env.development frontend\.env.local

# Start MongoDB
docker compose up -d mongodb

# Start development servers (in separate terminals)
pnpm dev:backend   # Terminal 1
pnpm dev:frontend  # Terminal 2
```

## 🧪 Testing the App

Once running, open http://localhost:3000 in your browser:

1. **Sign Up**: Create a new account at `/signup`
2. **Log In**: Log in at `/login`  
3. **Create Organization**: In the dashboard, create your first organization
4. **Create Project**: Add a project to your organization
5. **Deploy Cluster**: Deploy a MongoDB cluster (simulated in dev mode)

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start both frontend and backend in development mode |
| `pnpm dev:frontend` | Start frontend only |
| `pnpm dev:backend` | Start backend only |
| `pnpm build` | Build all packages |
| `pnpm lint` | Lint all packages |
| `pnpm test` | Run all tests |

### URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| API Docs (Swagger) | http://localhost:4000/docs |
| Mongo Express | http://localhost:8081 (profile: tools) |

## 🔧 Tech Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - UI components
- **React Query** - Data fetching
- **Zustand** - State management
- **Framer Motion** - Animations

### Backend
- **NestJS 10** - Node.js framework
- **TypeScript** - Type safety
- **MongoDB** - Database (via Mongoose)
- **Passport.js** - Authentication
- **Bull** - Job queue
- **@kubernetes/client-node** - K8s integration

### Infrastructure
- **Kubernetes** - Container orchestration
- **MongoDB Community Operator** - MongoDB on K8s
- **Terraform** - Infrastructure as Code
- **Hetzner Cloud** - European hosting

## 📋 Features

### Phase 1 (MVP)
- [x] User Authentication (signup, login, password reset)
- [x] Organization Management
- [x] Project Management
- [x] Cluster Lifecycle (create, resize, delete)
- [x] Job Queue System
- [x] Credentials Management
- [x] Event Logging
- [ ] Basic Backups

### Phase 2
- [ ] Self-service Restore
- [ ] IP Allowlist
- [ ] Multi-user per Organization
- [ ] Billing Integration

### Phase 3
- [ ] Multi-region Support
- [ ] Advanced Monitoring
- [ ] Connection Pooling
- [ ] Automated Scaling

## 🔐 Environment Variables

### Backend (.env)

```env
# Application
NODE_ENV=development
PORT=4000
API_PREFIX=api/v1

# MongoDB
MONGODB_URI=mongodb://localhost:27017/eutlas

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Kubernetes
KUBECONFIG_PATH=/path/to/kubeconfig
K8S_NAMESPACE_PREFIX=eutlas-

# Email
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user
SMTP_PASS=pass
SMTP_FROM=noreply@eutlas.eu

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Encryption
CREDENTIALS_ENCRYPTION_KEY=your-32-char-key
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

## 📚 API Documentation

The API is documented with Swagger/OpenAPI. After starting the backend, visit:

```
http://localhost:4000/docs
```

### Main Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /auth/signup` | Register new user |
| `POST /auth/login` | Login |
| `GET /orgs` | List organizations |
| `POST /orgs/:id/projects` | Create project |
| `POST /projects/:id/clusters` | Create cluster |
| `GET /clusters/:id/credentials` | Get connection string |

## 🐳 Docker

### Development with Docker Compose

```bash
# Start only MongoDB
docker compose up -d mongodb

# Start MongoDB + Admin UI
docker compose --profile tools up -d

# Start full stack (including backend/frontend)
docker compose --profile full up -d
```

### Production Build

```bash
# Build images
docker build -t eutlas-backend ./backend
docker build -t eutlas-frontend ./frontend

# Or use docker compose
docker compose --profile full build
```

## ☸️ Kubernetes Deployment

### Prerequisites
- Kubernetes cluster (1.28+)
- kubectl configured
- MongoDB Community Operator installed

### Deploy

```bash
# Install MongoDB Operator
kubectl apply -f https://raw.githubusercontent.com/mongodb/mongodb-kubernetes-operator/master/config/crd/bases/mongodbcommunity.mongodb.com_mongodbcommunity.yaml

# Deploy EUTLAS
kubectl apply -k infrastructure/kubernetes/overlays/production
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ in Europe 🇪🇺

