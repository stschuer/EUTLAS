# 📅 EUTLAS Development Phase Plan

## Overview

This document outlines the development phases for EUTLAS, from MVP to production-ready platform.

---

## Phase 0: Project Setup ✅
**Duration:** Week 1
**Status:** COMPLETED

### Goals
- [x] Monorepo structure with pnpm workspaces
- [x] Frontend scaffolding (Next.js 14 + shadcn/ui)
- [x] Backend scaffolding (NestJS + MongoDB)
- [x] Shared types package
- [x] Docker Compose for local development
- [x] Basic documentation

### Deliverables
- Working local development environment
- Both frontend and backend can start
- Shared types compile successfully

---

## Phase 1: Auth & Core Entities
**Duration:** Weeks 2-3
**Status:** IN PROGRESS

### Goals
- [ ] Complete authentication flow (signup, login, email verification, password reset)
- [ ] User management
- [ ] Organization CRUD with owner/admin/member roles
- [ ] Project CRUD within organizations
- [ ] Role-based access control (RBAC)

### Backend Tasks
| Task | Priority | Status |
|------|----------|--------|
| Auth Module (signup, login, JWT) | P0 | ✅ |
| Email verification flow | P0 | 🔄 |
| Password reset flow | P0 | ✅ |
| Users Module | P0 | ✅ |
| Organizations Module | P0 | ✅ |
| Projects Module | P0 | ✅ |
| Role-based guards | P0 | ✅ |
| Email service integration | P1 | ❌ |

### Frontend Tasks
| Task | Priority | Status |
|------|----------|--------|
| Login page | P0 | ✅ |
| Signup page | P0 | ✅ |
| Password reset pages | P1 | ❌ |
| Dashboard layout | P0 | ✅ |
| Organization list/create | P0 | 🔄 |
| Project list/create | P0 | ❌ |

### Acceptance Criteria
- User can sign up and receive verification email
- User can log in and see dashboard
- User can create/manage organizations
- User can create/manage projects within orgs
- Non-authorized users cannot access other orgs' data

---

## Phase 2: Cluster Lifecycle
**Duration:** Weeks 4-6
**Status:** NOT STARTED

### Goals
- [ ] Cluster creation workflow
- [ ] Job queue for async operations
- [ ] Kubernetes integration
- [ ] Cluster status synchronization
- [ ] Credentials management

### Backend Tasks
| Task | Priority | Status |
|------|----------|--------|
| Clusters Module (schema, API) | P0 | ✅ |
| Jobs Module (schema, queue) | P0 | ✅ |
| Job Processor (worker) | P0 | ✅ |
| Kubernetes Service | P0 | ✅ |
| MongoDB Operator integration | P0 | 🔄 |
| Create Cluster Processor | P0 | ✅ |
| Delete Cluster Processor | P0 | ✅ |
| Credentials Service | P0 | ✅ |
| Status sync job | P1 | ❌ |

### Frontend Tasks
| Task | Priority | Status |
|------|----------|--------|
| Cluster list view | P0 | ❌ |
| Create cluster wizard | P0 | ❌ |
| Plan selector component | P0 | ❌ |
| Cluster details page | P0 | ❌ |
| Status badge with polling | P0 | ❌ |
| Connection string display | P0 | ❌ |
| Delete cluster (with confirm) | P0 | ❌ |

### Acceptance Criteria
- User can create a cluster and see it provisioning
- Cluster status updates automatically (creating → ready)
- User can view connection credentials
- User can delete a cluster
- Failed operations show clear error messages

---

## Phase 3: Resizing & Events
**Duration:** Weeks 7-8
**Status:** NOT STARTED

### Goals
- [ ] Cluster resize functionality
- [ ] Event history tracking
- [ ] Enhanced error handling
- [ ] Structured logging

### Backend Tasks
| Task | Priority |
|------|----------|
| Resize Cluster Processor | P0 |
| Events Module | P1 |
| Correlation-ID middleware | P0 |
| Structured logging (Pino) | P0 |
| Error classification | P0 |
| Job retry logic | P1 |

### Frontend Tasks
| Task | Priority |
|------|----------|
| Resize cluster UI | P0 |
| Event timeline component | P1 |
| Improved error states | P1 |
| Loading skeletons | P2 |

### Acceptance Criteria
- User can resize cluster to different plan
- Event history shows all operations
- Errors are logged with correlation IDs
- Failed jobs retry automatically

---

## Phase 4: Backups
**Duration:** Weeks 9-10
**Status:** NOT STARTED

### Goals
- [ ] Automated daily backups
- [ ] Manual backup trigger
- [ ] Backup retention policy
- [ ] (Future: Self-service restore)

### Backend Tasks
| Task | Priority |
|------|----------|
| Backups Module | P0 |
| Backup Scheduler (cron) | P0 |
| Backup Processor | P0 |
| Storage integration | P0 |
| Retention cleanup job | P1 |

### Frontend Tasks
| Task | Priority |
|------|----------|
| Backup list view | P0 |
| Backup status badges | P0 |
| Manual backup button | P1 |

### Acceptance Criteria
- Backups run automatically every 24 hours
- User can see backup history
- Failed backups are visible
- Old backups are cleaned up per retention policy

---

## Phase 5: Admin & Polish
**Duration:** Weeks 11-12
**Status:** NOT STARTED

### Goals
- [ ] Admin dashboard
- [ ] Rate limiting
- [ ] Security hardening
- [ ] UI/UX polish

### Backend Tasks
| Task | Priority |
|------|----------|
| Admin endpoints | P1 |
| Force delete / retry jobs | P1 |
| Rate limiting (Throttler) | P1 |
| Metrics endpoint | P2 |
| Security audit | P1 |

### Frontend Tasks
| Task | Priority |
|------|----------|
| Admin dashboard | P2 |
| UI animations | P2 |
| Loading states | P1 |
| Mobile responsiveness | P1 |
| Accessibility audit | P2 |

### Acceptance Criteria
- Admin can view all orgs/clusters/jobs
- Admin can retry failed jobs
- Rate limiting prevents abuse
- UI is polished and responsive

---

## Future Phases

### Phase 6: Billing Integration
- Stripe/Paddle integration
- Usage tracking
- Invoice generation
- Plan enforcement

### Phase 7: Multi-Region
- Multiple K8s clusters
- Region selection
- Cross-region failover

### Phase 8: Advanced Features
- Connection pooling
- Query performance insights
- Automated scaling
- Data encryption at rest

---

## Team Allocation

### Frontend Agent Focus
1. UI components with shadcn/ui
2. Form handling with react-hook-form + zod
3. State management with Zustand
4. API integration with React Query
5. Real-time status updates (polling)

### Backend Agent Focus
1. NestJS modules and services
2. MongoDB schemas and queries
3. Job queue processing
4. Kubernetes API integration
5. Security and authentication

---

## Success Metrics

### Phase 1
- Time to signup: < 1 minute
- Login success rate: > 99%
- Org creation success rate: > 99%

### Phase 2
- Cluster provisioning time: < 5 minutes
- Status update latency: < 30 seconds
- Job success rate: > 95%

### Phase 3
- Resize completion time: < 3 minutes
- Error visibility: 100%
- Log searchability: < 10 seconds

### Phase 4
- Backup success rate: > 99%
- Backup completion time: < 30 minutes
- Zero data loss incidents

### Phase 5
- Page load time: < 2 seconds
- API response time (p95): < 200ms
- Zero security vulnerabilities




