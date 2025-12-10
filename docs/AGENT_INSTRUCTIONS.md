# 🤖 Agent Instructions

This document provides detailed instructions for AI agents working on the EUTLAS project.

---

## Frontend Agent

### Tech Stack
- **Next.js 14** with App Router
- **TypeScript** (strict mode)
- **Tailwind CSS** + **shadcn/ui**
- **Zustand** for state management
- **React Query** (TanStack Query) for data fetching
- **Zod** for validation
- **Framer Motion** for animations

### Design System

#### Color Palette
```css
/* Primary (Emerald) */
--primary: 160 84% 39%;

/* Background (Dark) */
--background: 222.2 84% 4.9%;

/* Cards */
--card: 222.2 84% 6.5%;

/* Accent (Cyan) */
--accent: 186 100% 42%;
```

#### Typography
- **UI Font:** Inter (system fallback)
- **Code Font:** JetBrains Mono

#### Component Conventions
- Use shadcn/ui components as base
- Extend with custom variants as needed
- Keep components in `src/components/`
- Use `cn()` utility for class merging

### File Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Public auth routes
│   ├── (dashboard)/       # Protected dashboard routes
│   └── api/               # API routes (BFF)
├── components/
│   ├── ui/                # Base UI components (shadcn)
│   ├── layout/            # Layout components
│   └── [feature]/         # Feature-specific components
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities and API client
├── stores/                # Zustand stores
└── types/                 # TypeScript types
```

### Coding Standards

#### Components
```tsx
// Always use TypeScript
interface Props {
  title: string;
  onAction: () => void;
}

// Prefer function components
export function MyComponent({ title, onAction }: Props) {
  return (
    <div className="p-4">
      <h1>{title}</h1>
      <Button onClick={onAction}>Click me</Button>
    </div>
  );
}
```

#### Hooks
```tsx
// Custom hooks in hooks/ directory
export function useCluster(clusterId: string) {
  return useQuery({
    queryKey: ['cluster', clusterId],
    queryFn: () => clustersApi.get(projectId, clusterId),
  });
}
```

#### API Calls
```tsx
// All API calls through lib/api-client.ts
import { clustersApi } from '@/lib/api-client';

const response = await clustersApi.create(projectId, {
  name: 'my-cluster',
  plan: 'MEDIUM',
});
```

### State Management

#### Auth State (Zustand)
```tsx
import { useAuthStore } from '@/stores/auth-store';

// In component
const { user, isAuthenticated, logout } = useAuthStore();
```

#### Server State (React Query)
```tsx
import { useQuery, useMutation } from '@tanstack/react-query';

// Queries for data fetching
const { data, isLoading } = useQuery({
  queryKey: ['clusters', projectId],
  queryFn: () => clustersApi.list(projectId),
});

// Mutations for updates
const createMutation = useMutation({
  mutationFn: (data) => clustersApi.create(projectId, data),
  onSuccess: () => queryClient.invalidateQueries(['clusters']),
});
```

### Form Handling

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClusterSchema } from '@eutlas/shared';

const form = useForm({
  resolver: zodResolver(createClusterSchema),
  defaultValues: { name: '', plan: 'MEDIUM' },
});
```

### Error Handling
- Use toast notifications for user feedback
- Show loading states during API calls
- Handle error states gracefully
- Never show raw error messages to users

---

## Backend Agent

### Tech Stack
- **NestJS 10**
- **TypeScript** (strict mode)
- **MongoDB** with Mongoose
- **Passport.js** + JWT for auth
- **Bull** for job queues
- **@kubernetes/client-node** for K8s API

### Architecture

#### Module Structure
```
src/modules/[feature]/
├── [feature].module.ts      # Module definition
├── [feature].controller.ts  # HTTP endpoints
├── [feature].service.ts     # Business logic
├── schemas/                 # Mongoose schemas
│   └── [entity].schema.ts
├── dto/                     # Data Transfer Objects
│   ├── create-[entity].dto.ts
│   └── update-[entity].dto.ts
└── [feature].spec.ts        # Unit tests
```

### Coding Standards

#### Controllers
```typescript
@Controller('clusters')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ClustersController {
  constructor(private readonly clustersService: ClustersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new cluster' })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateClusterDto,
  ) {
    return this.clustersService.create(user.userId, dto);
  }
}
```

#### Services
```typescript
@Injectable()
export class ClustersService {
  constructor(
    @InjectModel(Cluster.name) private clusterModel: Model<ClusterDocument>,
    private readonly jobsService: JobsService,
  ) {}

  async create(userId: string, dto: CreateClusterDto): Promise<Cluster> {
    // Business logic here
  }
}
```

#### DTOs (with validation)
```typescript
export class CreateClusterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z][a-z0-9-]*[a-z0-9]$/)
  name: string;

  @IsEnum(['DEV', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'])
  plan: string;
}
```

#### Schemas
```typescript
@Schema({ timestamps: true })
export class Cluster {
  @Prop({ required: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({ enum: ['creating', 'ready', 'failed'], default: 'creating' })
  status: string;
}
```

### Error Handling

#### Custom Exceptions
```typescript
throw new ConflictException({
  code: 'CLUSTER_EXISTS',
  message: 'A cluster with this name already exists',
});
```

#### Global Exception Filter
- All errors go through `GlobalExceptionFilter`
- Never expose internal error details
- Always include error code for client handling
- Log all errors with correlation ID

### Job System

#### Creating Jobs
```typescript
await this.jobsService.createJob({
  type: 'CREATE_CLUSTER',
  targetClusterId: cluster.id,
  payload: { plan: 'MEDIUM' },
});
```

#### Processing Jobs
```typescript
@Interval(5000)
async processJobs() {
  const jobs = await this.jobsService.findPendingJobs(5);
  for (const job of jobs) {
    await this.processJob(job);
  }
}
```

### Authentication & Authorization

#### Protecting Routes
```typescript
@UseGuards(JwtAuthGuard)
@Controller('clusters')
export class ClustersController {}
```

#### Checking Permissions
```typescript
// In controller
await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);
```

### Database Best Practices
- Always use indexes for queried fields
- Use `lean()` for read-only queries
- Handle ObjectId conversions properly
- Use transactions for multi-document operations

### Security Requirements
- Validate all inputs with class-validator
- Sanitize all outputs
- Use parameterized queries (Mongoose handles this)
- Rate limit auth endpoints
- Log security events

---

## Common Guidelines

### Git Workflow
1. Create feature branch from `main`
2. Make atomic commits with clear messages
3. Write/update tests
4. Create PR with description
5. Squash merge to main

### Commit Messages
```
feat(clusters): add resize functionality
fix(auth): handle expired token refresh
docs(readme): update setup instructions
refactor(jobs): simplify processor logic
```

### Testing
- Unit tests for services
- Integration tests for controllers
- E2E tests for critical flows

### Documentation
- Keep README up to date
- Document API changes in Swagger
- Update phase plan as tasks complete

---

## Quick Reference

### Starting Development
```bash
# Backend
cd backend && pnpm start:dev

# Frontend
cd frontend && pnpm dev

# Both
pnpm dev
```

### API Testing
- Swagger: http://localhost:4000/docs
- Use Postman/Insomnia for manual testing

### Database
- MongoDB: localhost:27017
- Mongo Express: localhost:8081 (docker compose --profile tools)

### Environment
- Backend: `.env` (copy from `env.example`)
- Frontend: `.env.local`


