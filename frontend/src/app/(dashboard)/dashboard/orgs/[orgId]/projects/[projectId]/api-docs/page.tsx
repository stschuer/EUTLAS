'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { projectsApi, clustersApi } from '@/lib/api-client';
import {
  ArrowLeft,
  Copy,
  Check,
  BookOpen,
  Download,
  Database,
  Search,
  Zap,
  Shield,
  Code,
} from 'lucide-react';

function generateApiDocs(project: any, clusters: any[], baseUrl: string): string {
  const clusterList = clusters
    .filter((c: any) => c && c.id)
    .map((c: any) => `- **${c.name}** (ID: \`${c.id}\`, Plan: ${c.plan}, Status: ${c.status}${c.vectorSearchEnabled ? ', Vector Search: enabled' : ''})`)
    .join('\n');

  const sampleCluster = clusters.find((c: any) => c && c.id) || { id: '<CLUSTER_ID>', name: 'my-cluster' };

  return `# EUTLAS MongoDB Platform — API Reference

> This document describes the EUTLAS REST API for managing MongoDB clusters, databases, vector search, and more.
> You can use this as context for an LLM to generate code, build integrations, or ask questions about the API.

## Connection Details

| Property | Value |
|----------|-------|
| **API Base URL** | \`${baseUrl}\` |
| **Project ID** | \`${project.id}\` |
| **Project Name** | ${project.name} |
| **Authentication** | Bearer token (JWT) or API Key — see Section 1 below |

## Your Clusters

${clusterList || '_No clusters created yet._'}

---

## 1. Authentication

The API supports two authentication methods: **JWT Bearer tokens** (for interactive/user sessions) and **API Keys** (for programmatic/machine access).

### Option A: JWT Bearer Token

Pass a JWT token in the \`Authorization\` header. Best for interactive sessions and short-lived access.

\`\`\`
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
\`\`\`

#### Login
\`\`\`
POST ${baseUrl}/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "your-password" }
\`\`\`

**Response:**
\`\`\`json
{ "success": true, "data": { "token": "eyJ...", "user": { "id": "...", "email": "..." } } }
\`\`\`

### Option B: API Key

Pass an API key in the \`x-api-key\` header. Best for CI/CD pipelines, scripts, automation, and server-to-server communication.

\`\`\`
x-api-key: <public_key>:<secret_key>
\`\`\`

The header value is your **public key** and **secret key** joined with a colon (\`:\`).

**Example:**
\`\`\`
x-api-key: eutlas_pk_a1b2c3d4e5f6a1b2...:eutlas_sk_f6e5d4c3b2a1f6e5d4c3b2a1...
\`\`\`

#### Creating API Keys

API keys are managed via the **Organization > API Keys** page in the dashboard, or via the management API:

\`\`\`
POST ${baseUrl}/orgs/<orgId>/api-keys
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "name": "CI/CD Pipeline Key",
  "description": "Used by GitHub Actions",
  "scopes": ["clusters:read", "backups:read", "backups:write"],
  "expiry": "90"
}
\`\`\`

> **Important:** The secret key is only shown **once** at creation time. Copy and store it securely.

#### Available Scopes (Permissions)

| Scope | Description |
|-------|-------------|
| \`clusters:read\` | Read cluster information |
| \`clusters:write\` | Create, update, delete clusters |
| \`projects:read\` | Read project information |
| \`projects:write\` | Create, update, delete projects |
| \`backups:read\` | Read backup information |
| \`backups:write\` | Create, restore, delete backups |
| \`metrics:read\` | Read cluster metrics and monitoring data |
| \`members:read\` | Read organization members |
| \`members:write\` | Invite and manage members |
| \`admin\` | Full administrative access (grants all scopes) |

Default scopes (if none specified): \`clusters:read\`, \`projects:read\`

#### API Key Features

- **IP Whitelisting** — Restrict key usage to specific IP addresses or CIDR ranges
- **Expiration** — Keys can be set to expire after 30, 60, 90, 180, or 365 days (or never)
- **Usage Tracking** — Last-used timestamp and usage count are tracked automatically

#### Rate Limits

| Window | Max Requests |
|--------|-------------|
| 1 second | 10 |
| 10 seconds | 50 |
| 1 minute | 200 |

If you exceed the rate limit, you will receive a \`429\` response with the message "API rate limit exceeded."

---

## 2. Cluster Management

### List Clusters
\`\`\`
GET ${baseUrl}/projects/${project.id}/clusters
\`\`\`

### Create Cluster
\`\`\`
POST ${baseUrl}/projects/${project.id}/clusters
Content-Type: application/json

{
  "name": "my-cluster",
  "plan": "MEDIUM",
  "enableVectorSearch": true
}
\`\`\`

**Plans:** \`DEV\`, \`SMALL\`, \`MEDIUM\`, \`LARGE\`, \`XLARGE\`, \`DEDICATED_L\`, \`DEDICATED_XL\`

Set \`"enableVectorSearch": true\` to deploy a Qdrant companion service alongside MongoDB for production-grade vector search (HNSW-based ANN).

### Get Cluster Details
\`\`\`
GET ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}
\`\`\`

### Resize Cluster
\`\`\`
PATCH ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/resize
Content-Type: application/json

{ "plan": "LARGE" }
\`\`\`

### Pause / Resume Cluster
\`\`\`
POST ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/pause
POST ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/resume
\`\`\`

### Delete Cluster
\`\`\`
DELETE ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}
\`\`\`

---

## 3. Vector Search (Qdrant-powered)

Vector search uses Qdrant as a companion service alongside MongoDB. When a cluster has \`vectorSearchEnabled: true\`, the system deploys Qdrant automatically and keeps data in sync via MongoDB Change Streams.

### 3.1 Index Management

#### List Vector Indexes
\`\`\`
GET ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/vector-search/indexes
\`\`\`

#### Create Vector Index
\`\`\`
POST ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/vector-search/indexes
Content-Type: application/json

{
  "name": "document_embeddings",
  "database": "mydb",
  "collection": "documents",
  "vectorFields": [
    {
      "path": "embedding",
      "dimensions": 1536,
      "similarity": "cosine"
    }
  ],
  "filterFields": [
    { "path": "category", "type": "string" },
    { "path": "created_at", "type": "date" }
  ],
  "textFields": ["title", "content"]
}
\`\`\`

**Parameters:**
- \`vectorFields[].path\` — The field in your MongoDB documents that contains the vector (array of numbers)
- \`vectorFields[].dimensions\` — Must match your embedding model (e.g. 1536 for OpenAI text-embedding-3-small)
- \`vectorFields[].similarity\` — \`cosine\` (default), \`dotProduct\`, or \`euclidean\`
- \`filterFields\` — Fields to enable filtering during search (indexed in Qdrant)
- \`textFields\` — Fields for hybrid text+vector search

When you create an index, the system:
1. Creates a Qdrant collection with HNSW indexing
2. Bulk-syncs all existing documents from MongoDB to Qdrant
3. Starts a real-time Change Stream watcher for ongoing sync

#### Get Index Details
\`\`\`
GET ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/vector-search/indexes/<indexId>
\`\`\`

#### Delete Index
\`\`\`
DELETE ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/vector-search/indexes/<indexId>
\`\`\`

#### Rebuild Index
\`\`\`
POST ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/vector-search/indexes/<indexId>/rebuild
\`\`\`

#### Bulk Sync (re-sync MongoDB → Qdrant)
\`\`\`
POST ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/vector-search/indexes/<indexId>/sync
\`\`\`

Returns: \`{ "synced": 15000, "errors": 3 }\`

### 3.2 Vector Search (raw vector)

Search by providing a pre-computed vector:

\`\`\`
POST ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/vector-search/search?index=document_embeddings&database=mydb&collection=documents
Content-Type: application/json

{
  "vector": [0.1, -0.05, 0.23, ...],
  "path": "embedding",
  "limit": 10,
  "filter": {
    "category": "technical"
  }
}
\`\`\`

**Response:**
\`\`\`json
{
  "success": true,
  "data": {
    "results": [
      {
        "_id": "64f1a2b3c4d5e6f7g8h9i0j1",
        "score": 0.95,
        "document": { "title": "Getting Started", "content": "...", "embedding": [...] }
      }
    ],
    "count": 10
  }
}
\`\`\`

### 3.3 Semantic Search (text → auto-embedding → search)

The server generates the embedding for you using OpenAI, Cohere, or HuggingFace:

\`\`\`
POST ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/vector-search/semantic-search?index=document_embeddings&database=mydb&collection=documents
Content-Type: application/json

{
  "query": "How do I set up authentication?",
  "path": "embedding",
  "limit": 10,
  "embeddingProvider": "openai",
  "model": "text-embedding-3-small"
}
\`\`\`

**Embedding Providers:**

| Provider | Models | Dimensions |
|----------|--------|------------|
| \`openai\` | \`text-embedding-3-small\` (default), \`text-embedding-3-large\`, \`text-embedding-ada-002\` | 1536, 3072, 1536 |
| \`cohere\` | \`embed-english-v3.0\`, \`embed-multilingual-v3.0\` | 1024 |
| \`huggingface\` | \`all-MiniLM-L6-v2\`, \`all-mpnet-base-v2\` | 384, 768 |

### 3.4 Hybrid Search (vector + text combined)

Combines vector similarity with MongoDB full-text search (\`$text\`):

\`\`\`
POST ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/vector-search/hybrid-search?index=document_embeddings&database=mydb&collection=documents
Content-Type: application/json

{
  "query": "authentication tutorial",
  "vector": [0.1, -0.05, ...],
  "path": "embedding",
  "vectorWeight": 0.7,
  "limit": 10
}
\`\`\`

\`vectorWeight\` controls the balance: \`0.7\` means 70% vector similarity + 30% text relevance.

### 3.5 Available Analyzers & Embedding Models

\`\`\`
GET ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/vector-search/analyzers
GET ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/vector-search/embedding-models
\`\`\`

---

## 4. Data Explorer

### List Databases
\`\`\`
GET ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/data-explorer/databases
\`\`\`

### List Collections
\`\`\`
GET ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/data-explorer/databases/<dbName>/collections
\`\`\`

### Query Documents
\`\`\`
POST ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/data-explorer/databases/<dbName>/collections/<collName>/find
Content-Type: application/json

{
  "filter": { "status": "active" },
  "sort": { "createdAt": -1 },
  "limit": 20,
  "skip": 0
}
\`\`\`

### Insert Document
\`\`\`
POST ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/data-explorer/databases/<dbName>/collections/<collName>/insert
Content-Type: application/json

{ "document": { "title": "My doc", "embedding": [0.1, 0.2, ...] } }
\`\`\`

---

## 5. Database Users

### Create User
\`\`\`
POST ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/database-users
Content-Type: application/json

{
  "username": "app-user",
  "password": "secure-password",
  "roles": [
    { "role": "readWrite", "db": "mydb" }
  ]
}
\`\`\`

### List / Update / Delete Users
\`\`\`
GET    ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/database-users
PATCH  ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/database-users/<userId>
DELETE ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/database-users/<userId>
\`\`\`

---

## 6. Backups

### List Backups
\`\`\`
GET ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/backups
\`\`\`

### Create Backup
\`\`\`
POST ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/backups
Content-Type: application/json

{ "description": "Pre-migration backup" }
\`\`\`

### Restore from Backup
\`\`\`
POST ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/backups/<backupId>/restore
\`\`\`

---

## 7. Monitoring & Metrics

### Get Cluster Metrics
\`\`\`
GET ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/metrics?period=24h
\`\`\`

Returns CPU, memory, storage, connections, and operation counts.

### Get Slow Queries
\`\`\`
GET ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/performance/slow-queries
\`\`\`

---

## 8. Network & Security

### IP Whitelist
\`\`\`
GET  ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/network/ip-whitelist
POST ${baseUrl}/projects/${project.id}/clusters/${sampleCluster.id}/network/ip-whitelist
Body: { "cidr": "203.0.113.0/24", "description": "Office network" }
\`\`\`

---

## Quick Start: RAG Pipeline with Vector Search

Here's how to build a NotebookLM-style RAG pipeline using EUTLAS:

\`\`\`python
import requests

API = "${baseUrl}"
PROJECT = "${project.id}"
CLUSTER = "${sampleCluster.id}"

# Authentication: choose ONE of the following
# Option A: JWT Bearer token
TOKEN = "your-jwt-token"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

# Option B: API Key (recommended for scripts & automation)
# API_KEY = "eutlas_pk_...:eutlas_sk_..."
# HEADERS = {"x-api-key": API_KEY, "Content-Type": "application/json"}

# 1. Create a cluster with vector search enabled
requests.post(f"{API}/projects/{PROJECT}/clusters", json={
    "name": "rag-cluster",
    "plan": "MEDIUM",
    "enableVectorSearch": True
}, headers=HEADERS)

# 2. Insert documents with embeddings into MongoDB
# (use the data explorer or connect directly)

# 3. Create a vector search index
requests.post(
    f"{API}/projects/{PROJECT}/clusters/{CLUSTER}/vector-search/indexes",
    json={
        "name": "doc_index",
        "database": "knowledge",
        "collection": "chunks",
        "vectorFields": [{"path": "embedding", "dimensions": 1536, "similarity": "cosine"}],
        "filterFields": [{"path": "source", "type": "string"}],
    },
    headers=HEADERS,
)

# 4. Semantic search — the API generates embeddings for you
results = requests.post(
    f"{API}/projects/{PROJECT}/clusters/{CLUSTER}/vector-search/semantic-search"
    f"?index=doc_index&database=knowledge&collection=chunks",
    json={
        "query": "How does user authentication work?",
        "path": "embedding",
        "limit": 5,
        "embeddingProvider": "openai",
        "model": "text-embedding-3-small",
    },
    headers=HEADERS,
).json()

# 5. Use the results as context for your LLM
context = "\\n".join([r["document"]["content"] for r in results["data"]["results"]])
# Pass 'context' to your LLM along with the user's question
\`\`\`

---

## Error Handling

All endpoints return:
\`\`\`json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
\`\`\`

Common HTTP status codes: \`200\` OK, \`201\` Created, \`400\` Bad Request, \`401\` Unauthorized, \`404\` Not Found, \`409\` Conflict, \`429\` Rate Limited.

---

*Generated for project **${project.name}** (${project.id}) on ${new Date().toISOString().split('T')[0]}.*
`;
}

export default function ApiDocsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;
  const projectId = params.projectId as string;
  const [copied, setCopied] = useState(false);

  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ['project', orgId, projectId],
    queryFn: async () => {
      const res = await projectsApi.get(orgId, projectId);
      return res.success ? res.data : null;
    },
    enabled: !!orgId && !!projectId,
  });

  const { data: clusters, isLoading: loadingClusters } = useQuery({
    queryKey: ['clusters', projectId],
    queryFn: async () => {
      const res = await clustersApi.list(projectId);
      return res.success ? res.data : [];
    },
    enabled: !!projectId,
  });

  const isLoading = loadingProject || loadingClusters;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Project not found.</p>
        <Button variant="ghost" onClick={() => router.push(`/dashboard/orgs/${orgId}`)}>
          Back to Organization
        </Button>
      </div>
    );
  }

  const baseUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/v1`
    : '/api/v1';

  const markdownContent = generateApiDocs(project, clusters || [], baseUrl);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdownContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eutlas-api-docs-${project.name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Simple markdown-to-sections renderer for display
  const sections = markdownContent.split('\n## ').map((section, i) => {
    if (i === 0) return { title: '', content: section };
    const lines = section.split('\n');
    return { title: lines[0], content: lines.slice(1).join('\n') };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/dashboard/orgs/${orgId}/projects/${projectId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Project
        </Button>
      </div>

      <PageHeader
        title="API Documentation"
        description="Complete API reference for your project — copy and paste into any LLM for instant coding assistance"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download .md
            </Button>
            <Button size="sm" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy for LLM
                </>
              )}
            </Button>
          </div>
        }
      />

      {/* Feature cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-dashed">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
              <Copy className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-medium text-sm">Copy for LLM</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Click "Copy for LLM" and paste the entire document into ChatGPT, Claude, or any AI assistant. It contains your real project and cluster IDs.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
              <Code className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-medium text-sm">Generate Code</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Ask the LLM to write Python, JavaScript, or any language code using this API. It has all the endpoints, parameters, and examples.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-medium text-sm">Vector Search Ready</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Full documentation for semantic search, hybrid search, and RAG pipelines with Qdrant-powered HNSW indexing.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documentation content */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Full API Reference
            </CardTitle>
            <CardDescription>
              Personalized for project <strong>{project.name}</strong> with your actual IDs
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {sections.map((section, i) => (
              <div key={i} className="mb-6">
                {section.title && (
                  <h2 className="text-lg font-semibold border-b pb-2 mb-3">
                    {section.title}
                  </h2>
                )}
                <pre className="whitespace-pre-wrap text-sm font-mono bg-muted/50 rounded-lg p-4 overflow-x-auto leading-relaxed">
                  {section.content.trim()}
                </pre>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
