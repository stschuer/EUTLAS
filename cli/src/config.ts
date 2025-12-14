import Conf from 'conf';

interface ConfigSchema {
  apiUrl: string;
  token: string | null;
  currentOrg: string | null;
  currentProject: string | null;
  outputFormat: 'table' | 'json' | 'yaml';
}

const config = new Conf<ConfigSchema>({
  projectName: 'eutlas-cli',
  defaults: {
    apiUrl: 'http://localhost:4000/api/v1',
    token: null,
    currentOrg: null,
    currentProject: null,
    outputFormat: 'table',
  },
});

export function getConfig<K extends keyof ConfigSchema>(key: K): ConfigSchema[K] {
  return config.get(key);
}

export function setConfig<K extends keyof ConfigSchema>(key: K, value: ConfigSchema[K]): void {
  config.set(key, value);
}

export function clearConfig(): void {
  config.clear();
}

export function getApiUrl(): string {
  return config.get('apiUrl');
}

export function getToken(): string | null {
  return config.get('token');
}

export function isAuthenticated(): boolean {
  return !!config.get('token');
}

export default config;




