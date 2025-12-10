# EUTLAS E2E Test Suite

Comprehensive end-to-end tests for the EUTLAS MongoDB Atlas clone.

## Quick Start

### Prerequisites

1. Backend running on `http://localhost:4000`
2. MongoDB running and accessible
3. PowerShell 5.1+ (Windows) or PowerShell Core (Linux/macOS)

### Run Tests

```powershell
# Full E2E test suite
.\run-e2e-tests.ps1

# Quick smoke test
.\smoke-test.ps1

# With custom URLs
.\run-e2e-tests.ps1 -ApiUrl "http://api.eutlas.local:4000/api/v1"
```

## Test Coverage

### Core Features
| Feature | Tests |
|---------|-------|
| Health & Security | Health check, security headers, rate limiting |
| Authentication | Signup, login, rate limit protection |
| Organizations | CRUD operations, member management |
| Projects | CRUD operations |
| Clusters | Create, get, pause, resume, clone |

### Database Features
| Feature | Tests |
|---------|-------|
| Database Users | Create, list, permissions |
| Network Access | IP whitelist CRUD |
| Backups | Create, list, get |
| PITR | Configuration, windows |
| Schema Validation | Create, validate documents |

### Monitoring & Alerts
| Feature | Tests |
|---------|-------|
| Metrics | Current metrics, history |
| Alert Rules | Create, list |
| Notification Channels | Create, list |
| Performance Advisor | Slow queries, suggestions |

### Infrastructure
| Feature | Tests |
|---------|-------|
| Private Networks | Create, subnets |
| Scaling | Recommendations, auto-scaling config |
| Log Forwarding | Destinations, configuration |
| Maintenance Windows | Schedule, history |

### Administration
| Feature | Tests |
|---------|-------|
| API Keys | Create, list, scopes |
| Audit Logs | Query, stats |
| Billing | Account, prices, usage |
| Dashboards | Create, widgets |

## Test Results

Tests output a summary like:

```
╔══════════════════════════════════════════════════════════════╗
║                    TEST RESULTS                              ║
╚══════════════════════════════════════════════════════════════╝

  Total Tests:    85
✅ Passed:         82
❌ Failed:         1
⚠️  Skipped:        2

  Pass Rate:      96.5%
  Duration:       45.32 seconds
```

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `-ApiUrl` | `http://localhost:4000/api/v1` | Backend API URL |
| `-BaseUrl` | `http://localhost:3001` | Frontend URL |
| `-TestEmail` | Auto-generated | Test user email |
| `-TestPassword` | `TestPassword123!` | Test user password |
| `-SkipCleanup` | `$false` | Skip cleanup after tests |

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run E2E Tests
  run: |
    cd e2e-tests
    pwsh -File run-e2e-tests.ps1 -ApiUrl "${{ secrets.API_URL }}"
```

### Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

## Writing New Tests

Use the `Test-Endpoint` function:

```powershell
Test-Endpoint `
    -Name "My Test" `
    -Method "POST" `
    -Url "$ApiUrl/endpoint" `
    -Headers $authHeaders `
    -Body ($data | ConvertTo-Json) `
    -ExpectedStatus @(200, 201)
```

Parameters:
- `Name` - Test name for reporting
- `Method` - HTTP method
- `Url` - Full endpoint URL
- `Headers` - Request headers (use `$authHeaders` for authenticated requests)
- `Body` - JSON body
- `ExpectedStatus` - Array of acceptable status codes
- `AllowFailure` - Don't fail if test fails (for optional features)
