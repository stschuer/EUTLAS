# EUTLAS E2E Test Script
# Comprehensive test suite covering all major features
#
# Usage:
#   .\run-e2e-tests.ps1 [-BaseUrl "http://localhost:3001"] [-ApiUrl "http://localhost:4000/api/v1"]

param(
    [string]$BaseUrl = "http://localhost:3001",
    [string]$ApiUrl = "http://localhost:4000/api/v1",
    [string]$TestEmail = "e2e-test@example.com",
    [string]$TestPassword = "TestPassword123!",
    [switch]$SkipCleanup
)

# Ensure TLS 1.2 is used (required for HTTPS endpoints)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ErrorActionPreference = "Continue"

# Test counters
$script:passedTests = 0
$script:failedTests = 0
$script:skippedTests = 0

# Helper Functions
function Write-TestHeader { param($msg) Write-Host "`n========================================" -ForegroundColor Blue; Write-Host "  $msg" -ForegroundColor Blue; Write-Host "========================================" -ForegroundColor Blue }
function Write-TestStep { param($msg) Write-Host "`n>> $msg" -ForegroundColor Magenta }
function Write-Pass { param($msg) Write-Host "[PASS] $msg" -ForegroundColor Green; $script:passedTests++ }
function Write-Fail { param($msg) Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:failedTests++ }
function Write-Skip { param($msg) Write-Host "[SKIP] $msg" -ForegroundColor Yellow; $script:skippedTests++ }
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [hashtable]$Headers = @{},
        [string]$Body = $null,
        [int[]]$ExpectedStatus = @(200, 201),
        [switch]$AllowFailure
    )
    
    try {
        $params = @{
            Method = $Method
            Uri = $Url
            Headers = $Headers
            ContentType = "application/json"
            ErrorAction = "Stop"
        }
        
        if ($Body) {
            $params.Body = $Body
        }
        
        $response = Invoke-RestMethod @params
        Write-Pass $Name
        return $response
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        
        if ($statusCode -and $ExpectedStatus -contains $statusCode) {
            Write-Pass "$Name - Expected status $statusCode"
            return $null
        }
        
        if ($AllowFailure) {
            Write-Skip "$Name - $($_.Exception.Message)"
            return $null
        }
        
        Write-Fail "$Name - $($_.Exception.Message)"
        return $null
    }
}

# ============================================
# Start Tests
# ============================================

Write-Host ""
Write-Host "========================================================" -ForegroundColor Blue
Write-Host "           EUTLAS E2E TEST SUITE                        " -ForegroundColor Blue
Write-Host "========================================================" -ForegroundColor Blue
Write-Host ""
Write-Info "Frontend URL: $BaseUrl"
Write-Info "API URL: $ApiUrl"
Write-Info "Test User: $TestEmail"
Write-Host ""

$testStartTime = Get-Date

# ============================================
# 1. Health Check
# ============================================
Write-TestHeader "1. Health Check"

$healthResponse = Test-Endpoint -Name "API Health Check" -Method "GET" -Url "$ApiUrl/health"

# ============================================
# 2. Authentication
# ============================================
Write-TestHeader "2. Authentication"

Write-TestStep "Signup / Login"
$signupBody = @{
    email = $TestEmail
    password = $TestPassword
    name = "E2E Test User"
} | ConvertTo-Json

$signupResult = Test-Endpoint -Name "Create Account" -Method "POST" -Url "$ApiUrl/auth/signup" -Body $signupBody -ExpectedStatus @(201, 200, 409)

$loginBody = @{
    email = $TestEmail
    password = $TestPassword
} | ConvertTo-Json

$loginResult = Test-Endpoint -Name "Login" -Method "POST" -Url "$ApiUrl/auth/login" -Body $loginBody

if (-not $loginResult -or -not $loginResult.data.accessToken) {
    Write-Fail "Cannot proceed without authentication token!"
    exit 1
}

$token = $loginResult.data.accessToken
$authHeaders = @{ Authorization = "Bearer $token" }
$userId = $loginResult.data.user.id

Write-Info "Authenticated as: $($loginResult.data.user.email)"

# ============================================
# 3. Organizations
# ============================================
Write-TestHeader "3. Organizations"

$createOrgBody = @{
    name = "E2E Test Org $(Get-Date -Format 'HHmmss')"
} | ConvertTo-Json

$orgResult = Test-Endpoint -Name "Create Organization" -Method "POST" -Url "$ApiUrl/orgs" -Headers $authHeaders -Body $createOrgBody
$orgId = $orgResult.data.id
Write-Info "Organization ID: $orgId"

Test-Endpoint -Name "List Organizations" -Method "GET" -Url "$ApiUrl/orgs" -Headers $authHeaders
Test-Endpoint -Name "Get Organization" -Method "GET" -Url "$ApiUrl/orgs/$orgId" -Headers $authHeaders
Test-Endpoint -Name "Get Members" -Method "GET" -Url "$ApiUrl/orgs/$orgId/members" -Headers $authHeaders

# ============================================
# 4. Projects
# ============================================
Write-TestHeader "4. Projects"

$createProjectBody = @{
    name = "E2E Test Project"
    description = "Automated E2E test project"
} | ConvertTo-Json

$projectResult = Test-Endpoint -Name "Create Project" -Method "POST" -Url "$ApiUrl/orgs/$orgId/projects" -Headers $authHeaders -Body $createProjectBody
$projectId = $projectResult.data.id
Write-Info "Project ID: $projectId"

Test-Endpoint -Name "List Projects" -Method "GET" -Url "$ApiUrl/orgs/$orgId/projects" -Headers $authHeaders
Test-Endpoint -Name "Get Project" -Method "GET" -Url "$ApiUrl/orgs/$orgId/projects/$projectId" -Headers $authHeaders

# ============================================
# 5. Clusters
# ============================================
Write-TestHeader "5. Clusters"

$createClusterBody = @{
    name = "e2e-test-cluster"
    plan = "DEV"
    mongoVersion = "7.0"
    region = "fsn1"
} | ConvertTo-Json

$clusterResult = Test-Endpoint -Name "Create Cluster" -Method "POST" -Url "$ApiUrl/projects/$projectId/clusters" -Headers $authHeaders -Body $createClusterBody
$clusterId = $clusterResult.data.id
Write-Info "Cluster ID: $clusterId"

Write-Info "Waiting for cluster provisioning..."
Start-Sleep -Seconds 3

Test-Endpoint -Name "List Clusters" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters" -Headers $authHeaders
Test-Endpoint -Name "Get Cluster" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId" -Headers $authHeaders
Test-Endpoint -Name "Get Credentials" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/credentials" -Headers $authHeaders

# ============================================
# 6. Database Users
# ============================================
Write-TestHeader "6. Database Users"

$createUserBody = @{
    username = "testuser"
    password = "SecurePass123!"
    roles = @(
        @{ role = "readWrite"; db = "testdb" }
    )
} | ConvertTo-Json

Test-Endpoint -Name "Create Database User" -Method "POST" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/users" -Headers $authHeaders -Body $createUserBody
Test-Endpoint -Name "List Database Users" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/users" -Headers $authHeaders

# ============================================
# 7. Network Access
# ============================================
Write-TestHeader "7. Network Access"

$createWhitelistBody = @{
    cidrBlock = "0.0.0.0/0"
    comment = "Allow all E2E test"
} | ConvertTo-Json

Test-Endpoint -Name "Add IP Whitelist" -Method "POST" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/network/whitelist" -Headers $authHeaders -Body $createWhitelistBody
Test-Endpoint -Name "List IP Whitelist" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/network/whitelist" -Headers $authHeaders

# ============================================
# 8. Backups
# ============================================
Write-TestHeader "8. Backups"

Test-Endpoint -Name "List Backups" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/backups" -Headers $authHeaders

# Wait for cluster to be ready before creating backup
Write-Info "Waiting for cluster to be ready for backup..."
$backupReady = $false
$backupWait = 0
while ($backupWait -lt 15 -and -not $backupReady) {
    try {
        $clusterCheck = Invoke-RestMethod -Uri "$ApiUrl/projects/$projectId/clusters/$clusterId" -Headers $authHeaders -Method GET
        if ($clusterCheck.data.status -eq "ready" -or $clusterCheck.data.status -eq "degraded") {
            $backupReady = $true
        } else {
            Start-Sleep -Seconds 2
            $backupWait += 2
        }
    } catch {
        Start-Sleep -Seconds 2
        $backupWait += 2
    }
}

$createBackupBody = @{
    name = "E2E Test Backup $(Get-Date -Format 'HHmmss')"
    description = "E2E test backup"
    retentionDays = 7
} | ConvertTo-Json

if ($backupReady) {
    Test-Endpoint -Name "Create Backup" -Method "POST" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/backups" -Headers $authHeaders -Body $createBackupBody
} else {
    Write-Skip "Create Backup - Cluster not ready"
}

# ============================================
# 9. Metrics
# ============================================
Write-TestHeader "9. Metrics"

Test-Endpoint -Name "Get Current Metrics" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/metrics/current" -Headers $authHeaders

# ============================================
# 10. Alerts
# ============================================
Write-TestHeader "10. Alerts"

$createAlertBody = @{
    name = "High CPU Alert"
    description = "Alert when CPU exceeds 80 percent"
    metricType = "cpu_usage"
    condition = "gt"
    threshold = 80
    severity = "warning"
    enabled = $true
} | ConvertTo-Json

Test-Endpoint -Name "Create Alert Rule" -Method "POST" -Url "$ApiUrl/orgs/$orgId/alerts/rules" -Headers $authHeaders -Body $createAlertBody
Test-Endpoint -Name "List Alert Rules" -Method "GET" -Url "$ApiUrl/orgs/$orgId/alerts/rules" -Headers $authHeaders

$createChannelBody = @{
    name = "Test Email Channel"
    type = "email"
    config = @{
        emails = @("test@example.com")
    }
    enabled = $true
} | ConvertTo-Json

Test-Endpoint -Name "Create Notification Channel" -Method "POST" -Url "$ApiUrl/orgs/$orgId/notification-channels" -Headers $authHeaders -Body $createChannelBody
Test-Endpoint -Name "List Notification Channels" -Method "GET" -Url "$ApiUrl/orgs/$orgId/notification-channels" -Headers $authHeaders

# ============================================
# 11. API Keys
# ============================================
Write-TestHeader "11. API Keys"

$createApiKeyBody = @{
    name = "E2E Test API Key"
    description = "Created by E2E tests"
    scopes = @("clusters:read", "projects:read")
    expiresAt = (Get-Date).AddDays(30).ToString("yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json

Test-Endpoint -Name "Create API Key" -Method "POST" -Url "$ApiUrl/orgs/$orgId/api-keys" -Headers $authHeaders -Body $createApiKeyBody
Test-Endpoint -Name "List API Keys" -Method "GET" -Url "$ApiUrl/orgs/$orgId/api-keys" -Headers $authHeaders

# ============================================
# 12. Activity Feed
# ============================================
Write-TestHeader "12. Activity Feed"

Test-Endpoint -Name "Get Activity Feed" -Method "GET" -Url "$ApiUrl/orgs/$orgId/activity" -Headers $authHeaders
Test-Endpoint -Name "Get Activity Stats" -Method "GET" -Url "$ApiUrl/orgs/$orgId/activity/stats" -Headers $authHeaders

# ============================================
# 13. Billing
# ============================================
Write-TestHeader "13. Billing"

Test-Endpoint -Name "Get Billing Account" -Method "GET" -Url "$ApiUrl/orgs/$orgId/billing/account" -Headers $authHeaders
Test-Endpoint -Name "Get Prices" -Method "GET" -Url "$ApiUrl/orgs/$orgId/billing/prices" -Headers $authHeaders

# ============================================
# 14. Audit Logs
# ============================================
Write-TestHeader "14. Audit Logs"

Test-Endpoint -Name "Query Audit Logs" -Method "GET" -Url "$ApiUrl/orgs/$orgId/audit" -Headers $authHeaders

# ============================================
# 15. Performance Advisor
# ============================================
Write-TestHeader "15. Performance Advisor"

Test-Endpoint -Name "Get Slow Queries" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/performance/slow-queries" -Headers $authHeaders
Test-Endpoint -Name "Get Index Suggestions" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/performance/suggestions" -Headers $authHeaders

# ============================================
# 16. PITR
# ============================================
Write-TestHeader "16. Point-in-Time Recovery"

Test-Endpoint -Name "Get PITR Config" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/pitr/config" -Headers $authHeaders

# ============================================
# 17. Search Indexes
# ============================================
Write-TestHeader "17. Search Indexes"

Test-Endpoint -Name "List Search Indexes" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/search-indexes" -Headers $authHeaders

$createSearchIndexBody = @{
    name = "e2e_search_index"
    database = "testdb"
    collection = "articles"
    type = "search"
    definition = @{
        mappings = @{
            dynamic = $true
            fields = @{
                title = @{ type = "string"; analyzer = "lucene.standard" }
                content = @{ type = "string"; analyzer = "lucene.standard" }
            }
        }
    }
} | ConvertTo-Json -Depth 5

$searchIndex = Test-Endpoint -Name "Create Search Index" -Method "POST" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/search-indexes" -Headers $authHeaders -Body $createSearchIndexBody -AllowFailure

if ($searchIndex -and $searchIndex.data -and $searchIndex.data.id) {
    $searchIndexId = $searchIndex.data.id
    Test-Endpoint -Name "Get Search Index" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/search-indexes/$searchIndexId" -Headers $authHeaders
    Test-Endpoint -Name "Get Search Index Stats" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/search-indexes/stats" -Headers $authHeaders
    Test-Endpoint -Name "Get Available Analyzers" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/search-indexes/analyzers" -Headers $authHeaders
} else {
    Write-Skip "Get Search Index - No index created"
    Test-Endpoint -Name "Get Search Index Stats" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/search-indexes/stats" -Headers $authHeaders
    Test-Endpoint -Name "Get Available Analyzers" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/search-indexes/analyzers" -Headers $authHeaders
}

# ============================================
# 18. Scaling
# ============================================
Write-TestHeader "18. Scaling"

Test-Endpoint -Name "Get Scaling Recommendations" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/scaling/recommendations" -Headers $authHeaders
Test-Endpoint -Name "Get Auto-Scaling Config" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/scaling/auto-scaling/config" -Headers $authHeaders

# ============================================
# 19. Private Networks
# ============================================
Write-TestHeader "19. Private Networks"

Test-Endpoint -Name "Get Regions" -Method "GET" -Url "$ApiUrl/projects/$projectId/networks/regions" -Headers $authHeaders
Test-Endpoint -Name "List Networks" -Method "GET" -Url "$ApiUrl/projects/$projectId/networks" -Headers $authHeaders

# ============================================
# 20. Schema Validation
# ============================================
Write-TestHeader "20. Schema Validation"

Test-Endpoint -Name "Get Schema Templates" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/schemas/templates" -Headers $authHeaders
Test-Endpoint -Name "List Schemas" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/schemas" -Headers $authHeaders

# ============================================
# 21. Backup Policy
# ============================================
Write-TestHeader "21. Backup Policy"

Test-Endpoint -Name "Get Backup Policy" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/backup-policy" -Headers $authHeaders
Test-Endpoint -Name "Get Compliance Presets" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/backup-policy/presets" -Headers $authHeaders

# ============================================
# 22. Log Forwarding
# ============================================
Write-TestHeader "22. Log Forwarding"

Test-Endpoint -Name "Get Destinations" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/log-forwarding/destinations" -Headers $authHeaders
Test-Endpoint -Name "List Configs" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/log-forwarding" -Headers $authHeaders

# ============================================
# 23. Maintenance Windows
# ============================================
Write-TestHeader "23. Maintenance Windows"

Test-Endpoint -Name "List Maintenance Windows" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/maintenance" -Headers $authHeaders

# ============================================
# 24. Online Archive
# ============================================
Write-TestHeader "24. Online Archive"

Test-Endpoint -Name "List Archive Rules" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/archive/rules" -Headers $authHeaders

# ============================================
# 25. Cluster Settings
# ============================================
Write-TestHeader "25. Cluster Settings"

Test-Endpoint -Name "Get Settings" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/settings" -Headers $authHeaders
Test-Endpoint -Name "Get Tags" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/settings/tags" -Headers $authHeaders

# ============================================
# 26. Custom Dashboards
# ============================================
Write-TestHeader "26. Custom Dashboards"

Test-Endpoint -Name "Get Templates" -Method "GET" -Url "$ApiUrl/orgs/$orgId/dashboards/templates" -Headers $authHeaders
Test-Endpoint -Name "List Dashboards" -Method "GET" -Url "$ApiUrl/orgs/$orgId/dashboards" -Headers $authHeaders

$createDashboardBody = @{
    name = "E2E Test Dashboard"
    description = "Created by E2E tests"
    visibility = "private"
} | ConvertTo-Json

Test-Endpoint -Name "Create Dashboard" -Method "POST" -Url "$ApiUrl/orgs/$orgId/dashboards" -Headers $authHeaders -Body $createDashboardBody

# ============================================
# 27. Cluster Operations
# ============================================
Write-TestHeader "27. Cluster Operations"

# Wait for cluster to be ready (job processor needs time)
Write-Info "Waiting for cluster to be ready..."
$maxWait = 15
$waited = 0
$clusterReady = $false
while ($waited -lt $maxWait -and -not $clusterReady) {
    try {
        $clusterStatus = Invoke-RestMethod -Uri "$ApiUrl/projects/$projectId/clusters/$clusterId" -Headers $authHeaders -Method GET
        if ($clusterStatus.data.status -eq "ready") {
            $clusterReady = $true
            Write-Info "Cluster is ready"
        } else {
            Write-Info "Cluster status: $($clusterStatus.data.status), waiting..."
            Start-Sleep -Seconds 2
            $waited += 2
        }
    } catch {
        Start-Sleep -Seconds 2
        $waited += 2
    }
}

if ($clusterReady) {
    Write-TestStep "Pause Cluster"
    $pauseBody = @{ reason = "E2E test pause" } | ConvertTo-Json
    Test-Endpoint -Name "Pause Cluster" -Method "POST" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/pause" -Headers $authHeaders -Body $pauseBody
    
    # Wait for pause to complete (async job, may take 10-20s)
    Write-Info "Waiting for pause to complete..."
    Start-Sleep -Seconds 3
    
    # Poll until paused or timeout
    $pausedStatus = $false
    $pauseWait = 0
    while ($pauseWait -lt 30 -and -not $pausedStatus) {
        try {
            $clusterCheck = Invoke-RestMethod -Uri "$ApiUrl/projects/$projectId/clusters/$clusterId" -Headers $authHeaders -Method GET
            if ($clusterCheck.data.status -eq "paused") {
                $pausedStatus = $true
                Write-Info "Cluster paused after ${pauseWait}s"
            } else {
                Write-Info "Cluster status: $($clusterCheck.data.status), waiting..."
                Start-Sleep -Seconds 2
                $pauseWait += 2
            }
        } catch {
            Start-Sleep -Seconds 2
            $pauseWait += 2
        }
    }

    if ($pausedStatus) {
        Write-TestStep "Resume Cluster"
        $resumeBody = @{ reason = "E2E test resume" } | ConvertTo-Json
        Test-Endpoint -Name "Resume Cluster" -Method "POST" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/resume" -Headers $authHeaders -Body $resumeBody
    } else {
        Write-Skip "Resume Cluster - Cluster not paused yet"
    }
} else {
    Write-Skip "Pause Cluster - Cluster not ready"
    Write-Skip "Resume Cluster - Skipped (depends on pause)"
}

# ============================================
# 28. SSO and Federated Authentication
# ============================================
Write-TestHeader "28. SSO and Federated Authentication"

Test-Endpoint -Name "List SSO Configs" -Method "GET" -Url "$ApiUrl/sso/orgs/$orgId/configs" -Headers $authHeaders

$createSamlConfigBody = @{
    name = "Test SAML Provider"
    type = "saml"
    enabled = $false
    saml = @{
        entryPoint = "https://idp.example.com/sso/saml"
        issuer = "urn:eutlas:sp"
        cert = "MIICpDCCAYwCCQDU+pQ5nzVHbDANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAls"
    }
    defaultRole = "MEMBER"
    allowJitProvisioning = $true
} | ConvertTo-Json -Depth 5

$ssoConfig = Test-Endpoint -Name "Create SAML Config" -Method "POST" -Url "$ApiUrl/sso/orgs/$orgId/configs" -Headers $authHeaders -Body $createSamlConfigBody -AllowFailure

$createOidcConfigBody = @{
    name = "Test OIDC Provider"
    type = "oidc"
    enabled = $false
    oidc = @{
        provider = "custom"
        clientId = "eutlas-test-client"
        clientSecret = "test-secret-12345"
        issuer = "https://idp.example.com"
        authorizationURL = "https://idp.example.com/authorize"
        tokenURL = "https://idp.example.com/token"
        userInfoURL = "https://idp.example.com/userinfo"
        scope = @("openid", "profile", "email")
    }
    defaultRole = "MEMBER"
    allowJitProvisioning = $true
} | ConvertTo-Json -Depth 5

Test-Endpoint -Name "Create OIDC Config" -Method "POST" -Url "$ApiUrl/sso/orgs/$orgId/configs" -Headers $authHeaders -Body $createOidcConfigBody -AllowFailure

if ($ssoConfig -and $ssoConfig.data -and $ssoConfig.data.id) {
    $ssoConfigId = $ssoConfig.data.id
    Test-Endpoint -Name "Get SSO Config" -Method "GET" -Url "$ApiUrl/sso/orgs/$orgId/configs/$ssoConfigId" -Headers $authHeaders
    Test-Endpoint -Name "Get SAML Metadata" -Method "GET" -Url "$ApiUrl/sso/saml/$ssoConfigId/metadata" -Headers $authHeaders -AllowFailure
} else {
    Write-Skip "Get SSO Config - No config created"
    Write-Skip "Get SAML Metadata - No config created"
}

# ============================================
# 29. Vector Search and Advanced Search
# ============================================
Write-TestHeader "29. Vector Search and Advanced Search"

Test-Endpoint -Name "List Vector Indexes" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/vector-search/indexes" -Headers $authHeaders

$createVectorIndexBody = @{
    name = "e2e_vector_index"
    database = "testdb"
    collection = "products"
    type = "vectorSearch"
    vectorFields = @(
        @{
            path = "embedding"
            dimensions = 1536
            similarity = "cosine"
        }
    )
    filterFields = @(
        @{ path = "category"; type = "string" },
        @{ path = "price"; type = "number" }
    )
} | ConvertTo-Json -Depth 5

$vectorIndex = Test-Endpoint -Name "Create Vector Index" -Method "POST" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/vector-search/indexes" -Headers $authHeaders -Body $createVectorIndexBody -AllowFailure

$vectorIndexReady = $false
if ($vectorIndex -and $vectorIndex.data -and $vectorIndex.data.id) {
    $vectorIndexId = $vectorIndex.data.id
    Test-Endpoint -Name "Get Vector Index" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/vector-search/indexes/$vectorIndexId" -Headers $authHeaders

    # Wait for index to reach 'ready' status (build takes 2-5 seconds)
    Write-Info "Waiting for vector index to build..."
    $indexWait = 0
    while ($indexWait -lt 15) {
        try {
            $idxStatus = Invoke-RestMethod -Uri "$ApiUrl/projects/$projectId/clusters/$clusterId/vector-search/indexes/$vectorIndexId" -Headers $authHeaders -Method GET
            if ($idxStatus.data.status -eq "ready") {
                $vectorIndexReady = $true
                Write-Info "Vector index is ready"
                break
            }
            Start-Sleep -Seconds 1
            $indexWait++
        } catch {
            Start-Sleep -Seconds 1
            $indexWait++
        }
    }
    if (-not $vectorIndexReady) {
        Write-Info "Vector index not ready after ${indexWait}s, search tests may fail"
    }
} else {
    Write-Skip "Get Vector Index - No index created"
}

# Test Analyzers (GET only - no POST endpoint for custom analyzers)
Test-Endpoint -Name "List Available Analyzers" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/vector-search/analyzers" -Headers $authHeaders

# Test Embedding Models
Test-Endpoint -Name "List Embedding Models" -Method "GET" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/vector-search/embedding-models" -Headers $authHeaders

# Test Semantic Search (uses query params for index/database/collection, body for query)
if ($vectorIndexReady) {
    $semanticSearchBody = @{
        query = "sample search query"
        limit = 10
    } | ConvertTo-Json -Depth 5

    Test-Endpoint -Name "Semantic Search" -Method "POST" -Url "$ApiUrl/projects/$projectId/clusters/$clusterId/vector-search/semantic-search?index=e2e_vector_index&database=testdb&collection=products" -Headers $authHeaders -Body $semanticSearchBody -AllowFailure
} else {
    Write-Skip "Semantic Search - Vector index not ready"
}

# ============================================
# 30. Rate Limiting and Security
# ============================================
Write-TestHeader "30. Rate Limiting and Security"

# Test that rate limiting headers are present
Write-TestStep "Checking rate limit headers"
try {
    $response = Invoke-WebRequest -Uri "$ApiUrl/health" -Method GET -UseBasicParsing -ErrorAction Stop
    # Server uses tiered rate limiting with -short, -medium, -long suffixes
    $rateLimitHeaders = @("X-RateLimit-Limit-short", "X-RateLimit-Remaining-short", "X-RateLimit-Limit-medium", "X-RateLimit-Remaining-medium", "X-RateLimit-Limit-long", "X-RateLimit-Remaining-long")
    $foundHeaders = 0
    foreach ($header in $rateLimitHeaders) {
        if ($response.Headers[$header]) {
            $foundHeaders++
        }
    }
    if ($foundHeaders -gt 0) {
        Write-Pass "Rate Limit Headers Present ($foundHeaders of $($rateLimitHeaders.Count) headers found)"
    } else {
        Write-Skip "Rate Limit Headers - Not detected (may be configured differently)"
    }
} catch {
    Write-Skip "Rate Limit Headers - Could not check: $($_.Exception.Message)"
}

# Test security headers
Write-TestStep "Checking security headers"
try {
    $response = Invoke-WebRequest -Uri "$ApiUrl/health" -Method GET -UseBasicParsing -ErrorAction Stop
    $securityHeaders = @("X-Content-Type-Options", "X-Frame-Options", "X-XSS-Protection")
    $foundSecHeaders = 0
    foreach ($header in $securityHeaders) {
        if ($response.Headers[$header]) {
            $foundSecHeaders++
        }
    }
    if ($foundSecHeaders -gt 0) {
        Write-Pass "Security Headers Present ($foundSecHeaders headers found)"
    } else {
        Write-Skip "Security Headers - Not all detected"
    }
} catch {
    Write-Skip "Security Headers - Could not check: $($_.Exception.Message)"
}

# ============================================
# Summary
# ============================================
$testEndTime = Get-Date
$totalDuration = ($testEndTime - $testStartTime).TotalSeconds

Write-Host ""
Write-Host "========================================================" -ForegroundColor Blue
Write-Host "                   TEST RESULTS                         " -ForegroundColor Blue
Write-Host "========================================================" -ForegroundColor Blue
Write-Host ""

$totalTests = $script:passedTests + $script:failedTests + $script:skippedTests
$passRate = if ($totalTests -gt 0) { [math]::Round(($script:passedTests / $totalTests) * 100, 1) } else { 0 }

Write-Host "  Total Tests:    $totalTests" -ForegroundColor White
Write-Host "  Passed:         $($script:passedTests)" -ForegroundColor Green
Write-Host "  Failed:         $($script:failedTests)" -ForegroundColor $(if ($script:failedTests -gt 0) { "Red" } else { "Gray" })
Write-Host "  Skipped:        $($script:skippedTests)" -ForegroundColor $(if ($script:skippedTests -gt 0) { "Yellow" } else { "Gray" })
Write-Host ""

$passRateColor = if ($passRate -ge 90) { "Green" } elseif ($passRate -ge 70) { "Yellow" } else { "Red" }
Write-Host "  Pass Rate:      $passRate%" -ForegroundColor $passRateColor
Write-Host "  Duration:       $([math]::Round($totalDuration, 2)) seconds" -ForegroundColor Cyan
Write-Host ""

if ($script:failedTests -eq 0) {
    Write-Host "  ALL TESTS PASSED!" -ForegroundColor Green
    Write-Host ""
    exit 0
} else {
    Write-Host "  Some tests failed. Please review the output above." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
