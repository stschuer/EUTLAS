// Use relative URL in production, absolute URL in development
const getApiBaseUrl = () => {
  // If explicitly set, use that
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // In browser, use relative URL (will go through ingress)
  if (typeof window !== 'undefined') {
    return '/api/v1';
  }
  // Server-side fallback
  return 'http://localhost:4000/api/v1';
};

const API_BASE_URL = getApiBaseUrl();

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private onUnauthorized: (() => void) | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem("auth_token", token);
    } else {
      localStorage.removeItem("auth_token");
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== "undefined") {
      // Try to get token from localStorage
      this.token = localStorage.getItem("auth_token");
      // Also check zustand persist storage as fallback
      if (!this.token) {
        try {
          const authData = localStorage.getItem("eutlas-auth");
          if (authData) {
            const parsed = JSON.parse(authData);
            if (parsed?.state?.token) {
              this.token = parsed.state.token;
              // Sync to auth_token for consistency
              localStorage.setItem("auth_token", this.token);
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
    return this.token;
  }

  setOnUnauthorized(callback: () => void) {
    this.onUnauthorized = callback;
  }

  private handleUnauthorized() {
    // Clear token
    this.setToken(null);
    // Notify auth store to logout
    if (this.onUnauthorized) {
      this.onUnauthorized();
    } else if (typeof window !== "undefined") {
      // Fallback: dispatch custom event
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }
  }

  private async request<T>(
    method: string,
    path: string,
    data?: unknown
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const token = this.getToken();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
      });

      let json;
      try {
        json = await response.json();
      } catch (e) {
        // If response is not JSON, create a basic error
        json = {
          error: {
            code: response.status === 401 ? "UNAUTHORIZED" : "UNKNOWN_ERROR",
            message: "An error occurred",
          },
        };
      }

      if (!response.ok) {
        // Handle 401 Unauthorized globally
        if (response.status === 401) {
          // Only handle unauthorized if we had a token (avoid false positives)
          if (token) {
            this.handleUnauthorized();
          }
        }
        return {
          success: false,
          error: json.error || {
            code: response.status === 401 ? "UNAUTHORIZED" : "UNKNOWN_ERROR",
            message: "An error occurred",
          },
        };
      }

      return json;
    } catch (error) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: "Unable to connect to the server",
        },
      };
    }
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>("GET", path);
  }

  async post<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, data);
  }

  async patch<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>("PATCH", path, data);
  }

  async put<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", path, data);
  }

  async delete<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", path, data);
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

// Auth API
export const authApi = {
  signup: (data: { email: string; password: string; name?: string }) =>
    apiClient.post("/auth/signup", data),

  login: (data: { email: string; password: string }) =>
    apiClient.post<{
      accessToken: string;
      expiresIn: number;
      user: { id: string; email: string; name?: string; verified: boolean };
    }>("/auth/login", data),

  verifyEmail: (token: string) =>
    apiClient.post("/auth/verify-email", { token }),

  forgotPassword: (email: string) =>
    apiClient.post("/auth/forgot-password", { email }),

  resetPassword: (token: string, password: string) =>
    apiClient.post("/auth/reset-password", { token, password }),
};

// Users API
export const usersApi = {
  getProfile: () => apiClient.get<{
    id: string;
    email: string;
    name?: string;
    verified: boolean;
    createdAt: string;
  }>("/users/me"),

  updateProfile: (data: { name?: string }) =>
    apiClient.patch<{
      id: string;
      email: string;
      name?: string;
      verified: boolean;
    }>("/users/me", data),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    apiClient.post("/users/me/password", data),

  deleteAccount: (password: string) =>
    apiClient.delete("/users/me", { password }),
};

// Organizations API
export const orgsApi = {
  list: () => apiClient.get("/orgs"),
  get: (orgId: string) => apiClient.get(`/orgs/${orgId}`),
  create: (data: { name: string }) => apiClient.post("/orgs", data),
  update: (orgId: string, data: { name?: string }) =>
    apiClient.patch(`/orgs/${orgId}`, data),
  delete: (orgId: string) => apiClient.delete(`/orgs/${orgId}`),
  getMembers: (orgId: string) => apiClient.get(`/orgs/${orgId}/members`),
};

// Projects API
export const projectsApi = {
  list: (orgId: string) => apiClient.get(`/orgs/${orgId}/projects`),
  get: (orgId: string, projectId: string) =>
    apiClient.get(`/orgs/${orgId}/projects/${projectId}`),
  create: (orgId: string, data: { name: string; description?: string }) =>
    apiClient.post(`/orgs/${orgId}/projects`, data),
  update: (orgId: string, projectId: string, data: { name?: string; description?: string }) =>
    apiClient.patch(`/orgs/${orgId}/projects/${projectId}`, data),
  delete: (orgId: string, projectId: string) =>
    apiClient.delete(`/orgs/${orgId}/projects/${projectId}`),
};

// Clusters API
export const clustersApi = {
  list: (projectId: string) => apiClient.get(`/projects/${projectId}/clusters`),
  get: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}`),
  create: (projectId: string, data: { name: string; plan: string; mongoVersion?: string }) =>
    apiClient.post(`/projects/${projectId}/clusters`, data),
  resize: (projectId: string, clusterId: string, data: { plan: string }) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/resize`, data),
  delete: (projectId: string, clusterId: string) =>
    apiClient.delete(`/projects/${projectId}/clusters/${clusterId}`),
  getCredentials: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/credentials`),
};

// Backups API
export const backupsApi = {
  list: (clusterId: string) => apiClient.get(`/clusters/${clusterId}/backups`),
  create: (clusterId: string) => apiClient.post(`/clusters/${clusterId}/backups`),
  getLatest: (clusterId: string) =>
    apiClient.get(`/clusters/${clusterId}/backups/latest`),
};

// Events API (Legacy)
export const eventsApi = {
  byCluster: (clusterId: string, limit?: number) =>
    apiClient.get(`/events/cluster/${clusterId}?limit=${limit || 50}`),
  byProject: (projectId: string, limit?: number) =>
    apiClient.get(`/events/project/${projectId}?limit=${limit || 50}`),
  byOrg: (orgId: string, limit?: number) =>
    apiClient.get(`/events/org/${orgId}?limit=${limit || 100}`),
};

// Activity Feed API (Enhanced)
export interface ActivityFilters {
  types?: string[];
  severities?: string[];
  search?: string;
  startDate?: string;
  endDate?: string;
  clusterId?: string;
  projectId?: string;
  page?: number;
  limit?: number;
  sortOrder?: 'asc' | 'desc';
}

export const activityApi = {
  getActivityFeed: (orgId: string, filters?: ActivityFilters) => {
    const params = new URLSearchParams();
    if (filters) {
      if (filters.types?.length) params.set('types', filters.types.join(','));
      if (filters.severities?.length) params.set('severities', filters.severities.join(','));
      if (filters.search) params.set('search', filters.search);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.clusterId) params.set('clusterId', filters.clusterId);
      if (filters.projectId) params.set('projectId', filters.projectId);
      if (filters.page) params.set('page', filters.page.toString());
      if (filters.limit) params.set('limit', filters.limit.toString());
      if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
    }
    return apiClient.get(`/orgs/${orgId}/activity?${params.toString()}`);
  },

  getStats: (orgId: string, days?: number) =>
    apiClient.get(`/orgs/${orgId}/activity/stats?days=${days || 7}`),

  getEventTypes: (orgId: string) =>
    apiClient.get(`/orgs/${orgId}/activity/types`),

  getSeverities: (orgId: string) =>
    apiClient.get(`/orgs/${orgId}/activity/severities`),

  exportJson: (orgId: string, filters?: ActivityFilters) => {
    const params = new URLSearchParams();
    if (filters) {
      if (filters.types?.length) params.set('types', filters.types.join(','));
      if (filters.severities?.length) params.set('severities', filters.severities.join(','));
      if (filters.search) params.set('search', filters.search);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
    }
    return `${API_BASE_URL}/orgs/${orgId}/activity/export/json?${params.toString()}`;
  },

  exportCsv: (orgId: string, filters?: ActivityFilters) => {
    const params = new URLSearchParams();
    if (filters) {
      if (filters.types?.length) params.set('types', filters.types.join(','));
      if (filters.severities?.length) params.set('severities', filters.severities.join(','));
      if (filters.search) params.set('search', filters.search);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
    }
    return `${API_BASE_URL}/orgs/${orgId}/activity/export/csv?${params.toString()}`;
  },
};

// PITR API
export const pitrApi = {
  getConfig: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/pitr/config`),

  enable: (projectId: string, clusterId: string, data: { retentionDays: number; settings?: object }) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/pitr/enable`, data),

  disable: (projectId: string, clusterId: string) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/pitr/disable`),

  updateConfig: (projectId: string, clusterId: string, data: { retentionDays?: number; settings?: object }) =>
    apiClient.put(`/projects/${projectId}/clusters/${clusterId}/pitr/config`, data),

  getRestoreWindow: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/pitr/window`),

  getOplogStats: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/pitr/oplog/stats`),

  createRestore: (projectId: string, clusterId: string, data: { restorePointTimestamp: string; targetClusterId?: string }) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/pitr/restore`, data),

  getRestore: (projectId: string, clusterId: string, restoreId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/pitr/restore/${restoreId}`),

  getRestoreHistory: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/pitr/restore`),

  cancelRestore: (projectId: string, clusterId: string, restoreId: string) =>
    apiClient.delete(`/projects/${projectId}/clusters/${clusterId}/pitr/restore/${restoreId}`),
};

// Search Indexes API
export const searchIndexesApi = {
  list: (projectId: string, clusterId: string, database?: string, collection?: string) => {
    const params = new URLSearchParams();
    if (database) params.set('database', database);
    if (collection) params.set('collection', collection);
    return apiClient.get(`/projects/${projectId}/clusters/${clusterId}/search-indexes?${params.toString()}`);
  },

  get: (projectId: string, clusterId: string, indexId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/search-indexes/${indexId}`),

  create: (projectId: string, clusterId: string, data: {
    name: string;
    database: string;
    collection: string;
    type: 'search' | 'vectorSearch';
    definition: object;
    analyzer?: string;
  }) => apiClient.post(`/projects/${projectId}/clusters/${clusterId}/search-indexes`, data),

  update: (projectId: string, clusterId: string, indexId: string, data: { definition?: object; analyzer?: string }) =>
    apiClient.patch(`/projects/${projectId}/clusters/${clusterId}/search-indexes/${indexId}`, data),

  delete: (projectId: string, clusterId: string, indexId: string) =>
    apiClient.delete(`/projects/${projectId}/clusters/${clusterId}/search-indexes/${indexId}`),

  test: (projectId: string, clusterId: string, indexId: string, data: { query: string; path?: string; limit?: number }) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/search-indexes/${indexId}/test`, data),

  getStats: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/search-indexes/stats`),

  getAnalyzers: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/search-indexes/analyzers`),
};

// Scaling Recommendations API
export const scalingApi = {
  getRecommendations: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/scaling/recommendations`),

  getHistory: (projectId: string, clusterId: string, limit?: number) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/scaling/recommendations/history?limit=${limit || 20}`),

  analyze: (projectId: string, clusterId: string) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/scaling/analyze`),

  applyRecommendation: (projectId: string, clusterId: string, recommendationId: string) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/scaling/recommendations/${recommendationId}/apply`),

  dismissRecommendation: (projectId: string, clusterId: string, recommendationId: string, reason?: string) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/scaling/recommendations/${recommendationId}/dismiss`, { reason }),

  getOrgStats: (orgId: string) =>
    apiClient.get(`/orgs/${orgId}/scaling/stats`),
};

// Log Forwarding API
export const logForwardingApi = {
  list: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/log-forwarding`),

  get: (projectId: string, clusterId: string, configId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/log-forwarding/${configId}`),

  create: (projectId: string, clusterId: string, data: any) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/log-forwarding`, data),

  update: (projectId: string, clusterId: string, configId: string, data: any) =>
    apiClient.patch(`/projects/${projectId}/clusters/${clusterId}/log-forwarding/${configId}`, data),

  delete: (projectId: string, clusterId: string, configId: string) =>
    apiClient.delete(`/projects/${projectId}/clusters/${clusterId}/log-forwarding/${configId}`),

  toggle: (projectId: string, clusterId: string, configId: string, enabled: boolean) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/log-forwarding/${configId}/toggle`, { enabled }),

  test: (projectId: string, clusterId: string, configId: string) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/log-forwarding/${configId}/test`),

  getStats: (projectId: string, clusterId: string, configId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/log-forwarding/${configId}/stats`),

  getDestinations: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/log-forwarding/destinations`),
};

// Maintenance Windows API
export const maintenanceApi = {
  list: (projectId: string, clusterId: string, includeHistory = false) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/maintenance?includeHistory=${includeHistory}`),

  get: (projectId: string, clusterId: string, windowId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/maintenance/${windowId}`),

  create: (projectId: string, clusterId: string, data: any) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/maintenance`, data),

  update: (projectId: string, clusterId: string, windowId: string, data: any) =>
    apiClient.patch(`/projects/${projectId}/clusters/${clusterId}/maintenance/${windowId}`, data),

  cancel: (projectId: string, clusterId: string, windowId: string, reason?: string) =>
    apiClient.delete(`/projects/${projectId}/clusters/${clusterId}/maintenance/${windowId}`, { data: { reason } }),

  defer: (projectId: string, clusterId: string, windowId: string, days: number, reason?: string) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/maintenance/${windowId}/defer`, { days, reason }),

  getUpcoming: (projectId: string, clusterId: string, days?: number) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/maintenance/upcoming?days=${days || 30}`),

  getHistory: (projectId: string, clusterId: string, limit?: number) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/maintenance/history?limit=${limit || 10}`),

  scheduleEmergency: (projectId: string, clusterId: string, data: any) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/maintenance/emergency`, data),
};

// Online Archive API
export const archiveApi = {
  listRules: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/archive/rules`),

  getStats: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/archive/stats`),

  createRule: (projectId: string, clusterId: string, data: any) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/archive/rules`, data),

  updateRule: (projectId: string, clusterId: string, ruleId: string, data: any) =>
    apiClient.patch(`/projects/${projectId}/clusters/${clusterId}/archive/rules/${ruleId}`, data),

  deleteRule: (projectId: string, clusterId: string, ruleId: string) =>
    apiClient.delete(`/projects/${projectId}/clusters/${clusterId}/archive/rules/${ruleId}`),

  pauseRule: (projectId: string, clusterId: string, ruleId: string) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/archive/rules/${ruleId}/pause`),

  resumeRule: (projectId: string, clusterId: string, ruleId: string) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/archive/rules/${ruleId}/resume`),

  runNow: (projectId: string, clusterId: string, ruleId: string) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/archive/rules/${ruleId}/run`),
};

// Audit Logs API
export const auditApi = {
  query: (orgId: string, params?: Record<string, any>) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.set(key, String(value));
        }
      });
    }
    return apiClient.get(`/orgs/${orgId}/audit?${searchParams.toString()}`);
  },

  getStats: (orgId: string, days?: number) =>
    apiClient.get(`/orgs/${orgId}/audit/stats?days=${days || 30}`),

  getActions: (orgId: string) =>
    apiClient.get(`/orgs/${orgId}/audit/actions`),

  getResourceTypes: (orgId: string) =>
    apiClient.get(`/orgs/${orgId}/audit/resource-types`),

  getById: (orgId: string, logId: string) =>
    apiClient.get(`/orgs/${orgId}/audit/${logId}`),

  exportUrl: (orgId: string, startDate: string, endDate: string, format: 'json' | 'csv' = 'json') =>
    `${API_BASE_URL}/orgs/${orgId}/audit/export?startDate=${startDate}&endDate=${endDate}&format=${format}`,
};

// Cluster Settings API
export const clusterSettingsApi = {
  get: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/settings`),

  update: (projectId: string, clusterId: string, data: any) =>
    apiClient.patch(`/projects/${projectId}/clusters/${clusterId}/settings`, data),

  getTags: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/settings/tags`),

  updateTags: (projectId: string, clusterId: string, tags: Record<string, string>) =>
    apiClient.patch(`/projects/${projectId}/clusters/${clusterId}/settings/tags`, { tags }),

  getLabels: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/settings/labels`),

  updateLabels: (projectId: string, clusterId: string, labels: string[]) =>
    apiClient.patch(`/projects/${projectId}/clusters/${clusterId}/settings/labels`, { labels }),

  getScheduledScaling: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/settings/scheduled-scaling`),

  addScheduledScaling: (projectId: string, clusterId: string, data: any) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/settings/scheduled-scaling`, data),

  updateScheduledScaling: (projectId: string, clusterId: string, scheduleId: string, data: any) =>
    apiClient.patch(`/projects/${projectId}/clusters/${clusterId}/settings/scheduled-scaling/${scheduleId}`, data),

  deleteScheduledScaling: (projectId: string, clusterId: string, scheduleId: string) =>
    apiClient.delete(`/projects/${projectId}/clusters/${clusterId}/settings/scheduled-scaling/${scheduleId}`),
};

// Private Networks API
export const privateNetworksApi = {
  list: (projectId: string) =>
    apiClient.get(`/projects/${projectId}/networks`),

  getById: (projectId: string, networkId: string) =>
    apiClient.get(`/projects/${projectId}/networks/${networkId}`),

  create: (projectId: string, data: any) =>
    apiClient.post(`/projects/${projectId}/networks`, data),

  update: (projectId: string, networkId: string, data: any) =>
    apiClient.patch(`/projects/${projectId}/networks/${networkId}`, data),

  delete: (projectId: string, networkId: string) =>
    apiClient.delete(`/projects/${projectId}/networks/${networkId}`),

  getRegions: (projectId: string) =>
    apiClient.get(`/projects/${projectId}/networks/regions`),

  // Subnets
  addSubnet: (projectId: string, networkId: string, data: any) =>
    apiClient.post(`/projects/${projectId}/networks/${networkId}/subnets`, data),

  removeSubnet: (projectId: string, networkId: string, subnetId: string) =>
    apiClient.delete(`/projects/${projectId}/networks/${networkId}/subnets/${subnetId}`),

  // Peering
  createPeering: (projectId: string, networkId: string, data: any) =>
    apiClient.post(`/projects/${projectId}/networks/${networkId}/peering`, data),

  // Cluster attachment
  attachCluster: (projectId: string, networkId: string, clusterId: string, privateIp?: string) =>
    apiClient.post(`/projects/${projectId}/networks/${networkId}/clusters`, { clusterId, privateIp }),

  detachCluster: (projectId: string, networkId: string, clusterId: string) =>
    apiClient.delete(`/projects/${projectId}/networks/${networkId}/clusters/${clusterId}`),

  // Cluster endpoint configuration
  getClusterEndpoint: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/endpoint`),

  updateClusterEndpoint: (projectId: string, clusterId: string, data: any) =>
    apiClient.patch(`/projects/${projectId}/clusters/${clusterId}/endpoint`, data),
};

// Dashboards API
export const dashboardsApi = {
  list: (orgId: string) =>
    apiClient.get(`/orgs/${orgId}/dashboards`),

  getById: (orgId: string, dashboardId: string) =>
    apiClient.get(`/orgs/${orgId}/dashboards/${dashboardId}`),

  create: (orgId: string, data: any) =>
    apiClient.post(`/orgs/${orgId}/dashboards`, data),

  update: (orgId: string, dashboardId: string, data: any) =>
    apiClient.patch(`/orgs/${orgId}/dashboards/${dashboardId}`, data),

  delete: (orgId: string, dashboardId: string) =>
    apiClient.delete(`/orgs/${orgId}/dashboards/${dashboardId}`),

  duplicate: (orgId: string, dashboardId: string, name: string) =>
    apiClient.post(`/orgs/${orgId}/dashboards/${dashboardId}/duplicate`, { name }),

  getTemplates: (orgId: string) =>
    apiClient.get(`/orgs/${orgId}/dashboards/templates`),

  createFromTemplate: (orgId: string, templateId: string, clusterId?: string) =>
    apiClient.post(`/orgs/${orgId}/dashboards/from-template/${templateId}${clusterId ? `?clusterId=${clusterId}` : ''}`),

  addWidget: (orgId: string, dashboardId: string, widget: any) =>
    apiClient.post(`/orgs/${orgId}/dashboards/${dashboardId}/widgets`, widget),

  updateWidget: (orgId: string, dashboardId: string, widgetId: string, data: any) =>
    apiClient.patch(`/orgs/${orgId}/dashboards/${dashboardId}/widgets/${widgetId}`, data),

  removeWidget: (orgId: string, dashboardId: string, widgetId: string) =>
    apiClient.delete(`/orgs/${orgId}/dashboards/${dashboardId}/widgets/${widgetId}`),

  listForCluster: (projectId: string, clusterId: string) =>
    apiClient.get(`/projects/${projectId}/clusters/${clusterId}/dashboards`),
};

// Cluster Operations API (extended)
export const clusterOpsApi = {
  clone: (projectId: string, clusterId: string, name: string, targetProjectId?: string, plan?: string) =>
    apiClient.post(`/projects/${projectId}/clusters/${clusterId}/clone`, { name, targetProjectId, plan }),
};

