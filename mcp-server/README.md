# EUTLAS MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
the EUTLAS control-plane API (clusters, backup policies, backups, resize) as
tools. It lets an assistant inspect and operate managed MongoDB clusters through
the product API — the supported path — instead of poking the Kubernetes cluster
directly (which desyncs the control-plane meta-DB).

## Tools

| Tool | Purpose |
| --- | --- |
| `eutlas_list_orgs` | List organizations |
| `eutlas_list_projects` | List projects in an org |
| `eutlas_list_clusters` | List clusters in a project |
| `eutlas_get_cluster` | Cluster detail (status, plan, connection) |
| `eutlas_get_backup_policy` | Read a cluster's backup policy |
| `eutlas_set_backup_policy` | Enable/adjust scheduled backups |
| `eutlas_list_backups` | List a cluster's snapshots |
| `eutlas_create_backup` | Trigger a one-off backup |
| `eutlas_resize_cluster` | Change plan (LARGE+ = 3-member HA) |

Read + non-destructive writes only. **Cluster deletion is intentionally not
exposed.**

## Setup

```bash
cd mcp-server
npm install
npm run build
```

### Get an API token

Mint an API key in the EUTLAS dashboard under **Org → API Keys** with the
scopes `clusters:read`, `clusters:write`, `backups:read`, `backups:write`,
`projects:read`. API keys authenticate via the `x-api-key` header and must be
supplied as the **`publicKey:secretKey` pair** — i.e.
`eutlas_pk_...:eutlas_sk_...` (both halves, colon-separated). A JWT from
`POST /auth/login` also works and is sent as a Bearer token; the server picks
the right scheme automatically based on whether the token contains a colon.

Then export it before launching your MCP client:

```bash
export EUTLAS_API_TOKEN="eutlas_pk_...:eutlas_sk_..."
# optional, defaults to the production API:
export EUTLAS_API_URL="https://app.eutlas.eu/api/v1"
```

## Registration

The repo ships a project-scoped [`.mcp.json`](../.mcp.json) that registers this
server for Claude Code. It reads `EUTLAS_API_TOKEN` (and optional
`EUTLAS_API_URL`) from your environment — the token is never stored in the repo.

Verify the connection with `/mcp` in Claude Code, or manually:

```bash
printf '%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
'{"jsonrpc":"2.0","method":"notifications/initialized"}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
| EUTLAS_API_TOKEN=dummy node dist/index.js
```

## Notes

- Base URL defaults to the production API; override with `EUTLAS_API_URL`
  (e.g. `http://localhost:4000/api/v1` against a local backend).
- Not part of the pnpm workspace — it is a standalone package with its own
  `npm install`.
