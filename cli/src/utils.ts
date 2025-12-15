import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';
import { getConfig } from './config';

export const spinner = ora();

export function success(message: string): void {
  console.log(chalk.green('✓'), message);
}

export function error(message: string): void {
  console.log(chalk.red('✗'), message);
}

export function warn(message: string): void {
  console.log(chalk.yellow('!'), message);
}

export function info(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}

export function formatOutput(data: any, headers?: string[]): void {
  const format = getConfig('outputFormat');

  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (format === 'yaml') {
    // Simple YAML-like output
    const yamlLike = (obj: any, indent = 0): string => {
      const spaces = '  '.repeat(indent);
      return Object.entries(obj)
        .map(([key, value]) => {
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            return `${spaces}${key}:\n${yamlLike(value, indent + 1)}`;
          }
          if (Array.isArray(value)) {
            return `${spaces}${key}:\n${value.map(v => `${spaces}  - ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n')}`;
          }
          return `${spaces}${key}: ${value}`;
        })
        .join('\n');
    };
    console.log(yamlLike(data));
    return;
  }

  // Table format
  if (Array.isArray(data) && data.length > 0 && headers) {
    const rows = data.map(item => headers.map(h => {
      const value = item[h];
      if (value === null || value === undefined) return '-';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    }));
    
    console.log(table([headers.map(h => chalk.bold(h)), ...rows]));
  } else if (typeof data === 'object') {
    const entries = Object.entries(data).map(([key, value]) => [
      chalk.bold(key),
      typeof value === 'object' ? JSON.stringify(value) : String(value ?? '-'),
    ]);
    console.log(table(entries));
  } else {
    console.log(data);
  }
}

export function requireAuth(): boolean {
  const token = getConfig('token');
  if (!token) {
    error('Not authenticated. Run: eutlas auth login');
    return false;
  }
  return true;
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleString();
}

export function formatStatus(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    running: chalk.green,
    ready: chalk.green,
    creating: chalk.blue,
    updating: chalk.yellow,
    paused: chalk.gray,
    deleting: chalk.red,
    failed: chalk.red,
  };
  const colorFn = colors[status] || chalk.white;
  return colorFn(status);
}





