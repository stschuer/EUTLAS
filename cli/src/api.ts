import { getApiUrl, getToken } from './config';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

class ApiClient {
  private async request<T>(
    method: string,
    path: string,
    data?: any
  ): Promise<ApiResponse<T>> {
    const url = `${getApiUrl()}${path}`;
    const token = getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
      });

      const json = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: json.error || {
            code: 'UNKNOWN_ERROR',
            message: `Request failed with status ${response.status}`,
          },
        };
      }

      return json;
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error.message || 'Failed to connect to API',
        },
      };
    }
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, data);
  }

  async patch<T>(path: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, data);
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path);
  }

  // Auth
  async login(email: string, password: string) {
    return this.post('/auth/login', { email, password });
  }

  async signup(email: string, password: string, firstName: string, lastName: string) {
    return this.post('/auth/signup', { email, password, firstName, lastName });
  }

  async getProfile() {
    return this.get('/auth/me');
  }

  // Organizations
  async listOrgs() {
    return this.get('/orgs');
  }

  async getOrg(orgId: string) {
    return this.get(`/orgs/${orgId}`);
  }

  async createOrg(name: string) {
    return this.post('/orgs', { name });
  }

  // Projects
  async listProjects(orgId: string) {
    return this.get(`/orgs/${orgId}/projects`);
  }

  async getProject(projectId: string) {
    return this.get(`/projects/${projectId}`);
  }

  async createProject(orgId: string, name: string, description?: string) {
    return this.post(`/orgs/${orgId}/projects`, { name, description });
  }

  // Clusters
  async listClusters(projectId: string) {
    return this.get(`/projects/${projectId}/clusters`);
  }

  async getCluster(projectId: string, clusterId: string) {
    return this.get(`/projects/${projectId}/clusters/${clusterId}`);
  }

  async createCluster(projectId: string, data: {
    name: string;
    plan: string;
    mongoVersion?: string;
    region?: string;
  }) {
    return this.post(`/projects/${projectId}/clusters`, data);
  }

  async resizeCluster(projectId: string, clusterId: string, plan: string) {
    return this.post(`/projects/${projectId}/clusters/${clusterId}/resize`, { plan });
  }

  async deleteCluster(projectId: string, clusterId: string) {
    return this.delete(`/projects/${projectId}/clusters/${clusterId}`);
  }

  async pauseCluster(projectId: string, clusterId: string) {
    return this.post(`/projects/${projectId}/clusters/${clusterId}/pause`);
  }

  async resumeCluster(projectId: string, clusterId: string) {
    return this.post(`/projects/${projectId}/clusters/${clusterId}/resume`);
  }

  async getClusterCredentials(projectId: string, clusterId: string) {
    return this.get(`/projects/${projectId}/clusters/${clusterId}/credentials`);
  }

  // Backups
  async listBackups(projectId: string, clusterId: string) {
    return this.get(`/projects/${projectId}/clusters/${clusterId}/backups`);
  }

  async createBackup(projectId: string, clusterId: string, description?: string) {
    return this.post(`/projects/${projectId}/clusters/${clusterId}/backups`, { description });
  }

  // Database Users
  async listDatabaseUsers(projectId: string, clusterId: string) {
    return this.get(`/projects/${projectId}/clusters/${clusterId}/users`);
  }

  async createDatabaseUser(projectId: string, clusterId: string, data: {
    username: string;
    password: string;
    roles: string[];
  }) {
    return this.post(`/projects/${projectId}/clusters/${clusterId}/users`, data);
  }

  // IP Whitelist
  async listIpWhitelist(projectId: string, clusterId: string) {
    return this.get(`/projects/${projectId}/clusters/${clusterId}/whitelist`);
  }

  async addIpWhitelist(projectId: string, clusterId: string, cidr: string, description?: string) {
    return this.post(`/projects/${projectId}/clusters/${clusterId}/whitelist`, { cidr, description });
  }
}

export const api = new ApiClient();





