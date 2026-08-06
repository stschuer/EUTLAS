#!/usr/bin/env node
/**
 * EUTLAS MCP server.
 *
 * Exposes the EUTLAS control-plane API (clusters, backup policies, backups,
 * resize) as MCP tools so an assistant can inspect and operate managed
 * MongoDB clusters without shelling into kubectl.
 *
 * Auth: set EUTLAS_API_TOKEN to a Bearer token (an API key minted under
 * Org → API Keys with at least clusters:read/write and backups:read/write,
 * or a JWT from /auth/login). EUTLAS_API_URL overrides the base URL.
 *
 * Safety: read + non-destructive writes only. Cluster deletion is
 * intentionally NOT exposed here.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = (process.env.EUTLAS_API_URL ?? "https://app.eutlas.eu/api/v1").replace(/\/$/, "");
const API_TOKEN = process.env.EUTLAS_API_TOKEN;

if (!API_TOKEN) {
  console.error(
    "[eutlas-mcp] EUTLAS_API_TOKEN is not set. Provide a Bearer token (EUTLAS API key) via the environment.",
  );
  process.exit(1);
}

type Json = unknown;

async function api(method: string, path: string, body?: Json): Promise<Json> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await res.text();
  let data: Json = raw;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    /* leave as text */
  }

  if (!res.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`EUTLAS API ${method} ${path} → ${res.status} ${res.statusText}: ${detail}`);
  }
  return data;
}

function ok(data: Json) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function fail(e: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }],
  };
}

const server = new McpServer({ name: "eutlas", version: "0.1.0" });

/* ---- Read ---- */

server.tool(
  "eutlas_list_orgs",
  "List EUTLAS organizations the token can access.",
  {},
  async () => {
    try {
      return ok(await api("GET", "/orgs"));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "eutlas_list_projects",
  "List projects in an organization.",
  { orgId: z.string().describe("Organization id") },
  async ({ orgId }) => {
    try {
      return ok(await api("GET", `/orgs/${orgId}/projects`));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "eutlas_list_clusters",
  "List MongoDB clusters in a project.",
  { projectId: z.string().describe("Project id") },
  async ({ projectId }) => {
    try {
      return ok(await api("GET", `/projects/${projectId}/clusters`));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "eutlas_get_cluster",
  "Get a single cluster incl. status, plan, connection info.",
  {
    projectId: z.string().describe("Project id"),
    clusterId: z.string().describe("Cluster id"),
  },
  async ({ projectId, clusterId }) => {
    try {
      return ok(await api("GET", `/projects/${projectId}/clusters/${clusterId}`));
    } catch (e) {
      return fail(e);
    }
  },
);

/* ---- Backups ---- */

server.tool(
  "eutlas_get_backup_policy",
  "Get the backup policy for a cluster (whether scheduled backups are enabled).",
  {
    projectId: z.string().describe("Project id"),
    clusterId: z.string().describe("Cluster id"),
  },
  async ({ projectId, clusterId }) => {
    try {
      return ok(await api("GET", `/projects/${projectId}/clusters/${clusterId}/backup-policy`));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "eutlas_set_backup_policy",
  "Enable/adjust scheduled backups for a cluster. Enabling makes the backend scheduler create recurring mongodump snapshots.",
  {
    projectId: z.string().describe("Project id"),
    clusterId: z.string().describe("Cluster id"),
    isEnabled: z.boolean().describe("Turn scheduled backups on/off"),
    snapshotFrequencyHours: z
      .number()
      .int()
      .min(1)
      .max(168)
      .optional()
      .describe("Hours between snapshots (1–168)"),
    snapshotRetentionDays: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe("Days to retain snapshots (1–365)"),
  },
  async ({ projectId, clusterId, ...body }) => {
    try {
      return ok(await api("PATCH", `/projects/${projectId}/clusters/${clusterId}/backup-policy`, body));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "eutlas_list_backups",
  "List existing backups/snapshots for a cluster.",
  {
    projectId: z.string().describe("Project id"),
    clusterId: z.string().describe("Cluster id"),
  },
  async ({ projectId, clusterId }) => {
    try {
      return ok(await api("GET", `/projects/${projectId}/clusters/${clusterId}/backups`));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "eutlas_create_backup",
  "Trigger an immediate one-off backup of a cluster.",
  {
    projectId: z.string().describe("Project id"),
    clusterId: z.string().describe("Cluster id"),
    description: z.string().optional().describe("Optional label for this backup"),
  },
  async ({ projectId, clusterId, description }) => {
    try {
      return ok(
        await api("POST", `/projects/${projectId}/clusters/${clusterId}/backups`, { description }),
      );
    } catch (e) {
      return fail(e);
    }
  },
);

/* ---- Scale ---- */

server.tool(
  "eutlas_resize_cluster",
  "Resize a cluster to a different plan. Plans LARGE and above are 3-member (HA); DEV/SMALL/MEDIUM are single-member. This is a live operation — expect a rolling reconfigure and, for scale-up to HA, an initial sync of the new members.",
  {
    projectId: z.string().describe("Project id"),
    clusterId: z.string().describe("Cluster id"),
    plan: z
      .enum([
        "DEV",
        "SMALL",
        "MEDIUM",
        "LARGE",
        "XLARGE",
        "XXL",
        "XXXL",
        "DEDICATED_L",
        "DEDICATED_XL",
      ])
      .describe("Target plan"),
  },
  async ({ projectId, clusterId, plan }) => {
    try {
      return ok(await api("POST", `/projects/${projectId}/clusters/${clusterId}/resize`, { plan }));
    } catch (e) {
      return fail(e);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[eutlas-mcp] connected. API base: ${API_URL}`);
}

main().catch((e) => {
  console.error("[eutlas-mcp] fatal:", e);
  process.exit(1);
});
