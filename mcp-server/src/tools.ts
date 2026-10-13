import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type Api = (method: string, path: string, body?: unknown) => Promise<unknown>;

const PLANS = ["DEV", "SMALL", "MEDIUM", "LARGE", "XLARGE", "XXL", "XXXL", "DEDICATED_L", "DEDICATED_XL"] as const;
const ROLES = [
  "read", "readWrite", "dbAdmin", "dbOwner", "userAdmin", "clusterAdmin",
  "readAnyDatabase", "readWriteAnyDatabase", "userAdminAnyDatabase", "dbAdminAnyDatabase", "root",
] as const;

const project = z.string().describe("Project id");
const cluster = z.string().describe("Cluster id");

function register(
  server: McpServer,
  api: Api,
  name: string,
  description: string,
  shape: Record<string, z.ZodTypeAny>,
  request: (args: any) => [string, string, unknown?],
) {
  server.tool(name, description, shape, async (args: any) => {
    try {
      const [method, path, body] = request(args);
      const data = await api(method, path, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] };
    }
  });
}

/** Day-to-day cluster operations, scoped by the API's tenant checks. */
export function registerOperationsTools(server: McpServer, api: Api) {
  const c = (p: string, cl: string) => `/projects/${p}/clusters/${cl}`;
  const t = (name: string, desc: string, shape: Record<string, z.ZodTypeAny>, req: (a: any) => [string, string, unknown?]) =>
    register(server, api, name, desc, shape, req);

  t("eutlas_get_cluster_status", "Live Kubernetes status of a cluster's MongoDB (replicas ready, phase).",
    { projectId: project, clusterId: cluster }, (a) => ["GET", `${c(a.projectId, a.clusterId)}/status`]);

  t("eutlas_create_cluster", "Create a new cluster (provisions a dedicated Hetzner server, ~5 min). Poll eutlas_get_cluster until status is ready.",
    {
      projectId: project,
      name: z.string().regex(/^[a-z][a-z0-9-]{1,28}[a-z0-9]$/).describe("Lowercase name, 3–30 chars"),
      plan: z.enum(PLANS),
      region: z.enum(["fsn1", "nbg1"]).default("fsn1").describe("Hetzner location (Germany only)"),
      mongoVersion: z.string().optional().describe("e.g. 7.0, 8.0"),
    },
    ({ projectId, ...body }) => ["POST", `/projects/${projectId}/clusters`, body]);

  t("eutlas_pause_cluster", "Pause a cluster (stops MongoDB, keeps data).",
    { projectId: project, clusterId: cluster, reason: z.string().optional() },
    (a) => ["POST", `${c(a.projectId, a.clusterId)}/pause`, { reason: a.reason }]);

  t("eutlas_resume_cluster", "Resume a paused cluster.",
    { projectId: project, clusterId: cluster, reason: z.string().optional() },
    (a) => ["POST", `${c(a.projectId, a.clusterId)}/resume`, { reason: a.reason }]);

  /* IP access list (NetworkPolicy on the cluster's node) */
  t("eutlas_list_access_list", "List the IP access list of a cluster. Only these CIDRs (plus the platform) can reach MongoDB.",
    { projectId: project, clusterId: cluster }, (a) => ["GET", `${c(a.projectId, a.clusterId)}/network/ip-whitelist`]);

  t("eutlas_add_access_list_entry", "Allow a CIDR to connect to a cluster. Applied to the cluster's NetworkPolicy immediately.",
    {
      projectId: project, clusterId: cluster,
      cidrBlock: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/).describe("e.g. 203.0.113.7/32"),
      comment: z.string().max(200).optional().describe("Who/what this is"),
    },
    (a) => ["POST", `${c(a.projectId, a.clusterId)}/network/ip-whitelist`, { cidrBlock: a.cidrBlock, comment: a.comment }]);

  t("eutlas_remove_access_list_entry", "Remove an IP access list entry. Clients from that CIDR lose access immediately.",
    { projectId: project, clusterId: cluster, entryId: z.string() },
    (a) => ["DELETE", `${c(a.projectId, a.clusterId)}/network/ip-whitelist/${a.entryId}`]);

  /* Database users */
  t("eutlas_list_database_users", "List MongoDB users of a cluster.",
    { projectId: project, clusterId: cluster }, (a) => ["GET", `${c(a.projectId, a.clusterId)}/database-users`]);

  t("eutlas_create_database_user", "Create a MongoDB user on a cluster.",
    {
      projectId: project, clusterId: cluster,
      username: z.string(), password: z.string().min(12),
      roles: z.array(z.object({ role: z.enum(ROLES), db: z.string() })).min(1),
    },
    ({ projectId, clusterId, ...body }) => ["POST", `${c(projectId, clusterId)}/database-users`, body]);

  /* Backups */
  t("eutlas_restore_backup", "Restore a completed backup into its cluster (mongorestore --drop on the restored namespaces).",
    {
      projectId: project, clusterId: cluster, backupId: z.string(),
      databases: z.array(z.string()).optional().describe("Only these databases"),
      collections: z.array(z.string()).optional().describe("Only these db.collection namespaces"),
    },
    ({ projectId, clusterId, backupId, ...body }) =>
      ["POST", `${c(projectId, clusterId)}/backups/${backupId}/restore`, { restoreToSource: true, ...body }]);

  /* Migrations from Atlas / self-hosted MongoDB */
  const migrations = (a: any) => `${c(a.projectId, a.clusterId)}/migrations`;
  t("eutlas_analyze_migration_source", "Connect to a source MongoDB (e.g. Atlas) and report databases, sizes, versions and estimated migration time. Does not copy data.",
    { projectId: project, clusterId: cluster.describe("Target cluster id"), sourceUri: z.string().describe("mongodb:// or mongodb+srv:// URI") },
    (a) => ["POST", `${migrations(a)}/analyze`, { sourceUri: a.sourceUri }]);

  t("eutlas_start_migration", "Start copying data from a source MongoDB into the target cluster (runs in the background).",
    {
      projectId: project, clusterId: cluster.describe("Target cluster id"),
      sourceUri: z.string(),
      sourceProvider: z.enum(["atlas", "self-hosted", "digitalocean", "aws-documentdb", "other"]),
      databases: z.array(z.string()).optional(),
      excludeDatabases: z.array(z.string()).optional(),
      options: z.object({
        dropExisting: z.boolean().optional(),
        includeIndexes: z.boolean().optional(),
        numParallelCollections: z.number().int().min(1).max(16).optional(),
      }).optional(),
    },
    ({ projectId, clusterId, ...body }) => ["POST", `${c(projectId, clusterId)}/migrations`, body]);

  t("eutlas_list_migrations", "List migrations into a cluster.",
    { projectId: project, clusterId: cluster }, (a) => ["GET", migrations(a)]);

  t("eutlas_get_migration", "Migration progress and verification results.",
    { projectId: project, clusterId: cluster, migrationId: z.string() },
    (a) => ["GET", `${migrations(a)}/${a.migrationId}`]);

  t("eutlas_get_migration_logs", "Log lines of a migration.",
    { projectId: project, clusterId: cluster, migrationId: z.string() },
    (a) => ["GET", `${migrations(a)}/${a.migrationId}/logs`]);

  t("eutlas_cancel_migration", "Cancel a running migration.",
    { projectId: project, clusterId: cluster, migrationId: z.string() },
    (a) => ["DELETE", `${migrations(a)}/${a.migrationId}`]);

  t("eutlas_retry_migration", "Retry a failed or cancelled migration.",
    { projectId: project, clusterId: cluster, migrationId: z.string() },
    (a) => ["POST", `${migrations(a)}/${a.migrationId}/retry`]);
}

/** Platform-wide tools; require a platform:admin API key. */
export function registerAdminTools(server: McpServer, api: Api) {
  const t = (name: string, desc: string, shape: Record<string, z.ZodTypeAny>, req: (a: any) => [string, string, unknown?]) =>
    register(server, api, name, desc, shape, req);

  t("eutlas_admin_list_tenants", "All organizations on the platform with counts.", {}, () => ["GET", "/admin/tenants"]);

  t("eutlas_admin_list_clusters", "All clusters across all organizations, with org/project names and dedicated server.",
    { status: z.string().optional().describe("e.g. ready, failed, creating"), orgId: z.string().optional() },
    (a) => ["GET", `/admin/clusters?${new URLSearchParams(Object.entries(a).filter(([, v]) => v) as any)}`]);

  t("eutlas_admin_diagnostics", "Platform health: node pressure/taints/memory reservation, unhealthy pods per namespace, long-running and stuck jobs, backup freshness per cluster.",
    {}, () => ["GET", "/admin/diagnostics"]);

  t("eutlas_admin_cluster_connections", "External client IPs currently connected to a cluster, next to its IP access list — check before tightening the list.",
    { clusterId: cluster }, (a) => ["GET", `/admin/clusters/${a.clusterId}/connections`]);

  t("eutlas_admin_list_jobs", "Control-plane jobs (create/delete/backup/restore/migrate…).",
    { status: z.enum(["pending", "in_progress", "success", "failed"]).optional(), clusterId: z.string().optional(), limit: z.number().int().max(200).optional() },
    (a) => ["GET", `/admin/jobs?${new URLSearchParams(Object.entries(a).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))}`]);

  t("eutlas_admin_retry_job", "Re-queue a failed or stuck job.", { jobId: z.string() }, (a) => ["POST", `/admin/jobs/${a.jobId}/retry`]);

  t("eutlas_admin_fail_job", "Mark a stuck job as failed without retry.",
    { jobId: z.string(), reason: z.string().optional() }, (a) => ["POST", `/admin/jobs/${a.jobId}/fail`, { reason: a.reason }]);

  /* Destructive — admin mode only */
  t("eutlas_admin_delete_cluster", "DESTRUCTIVE: delete a cluster, its dedicated server, volume and backups. Irreversible.",
    { projectId: project, clusterId: cluster }, (a) => ["DELETE", `/projects/${a.projectId}/clusters/${a.clusterId}`]);

  t("eutlas_admin_delete_database_user", "DESTRUCTIVE: delete a MongoDB user from a cluster.",
    { projectId: project, clusterId: cluster, userId: z.string() },
    (a) => ["DELETE", `/projects/${a.projectId}/clusters/${a.clusterId}/database-users/${a.userId}`]);
}
