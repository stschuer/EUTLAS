import { Command } from 'commander';
import { setConfig, getConfig, clearConfig } from '../config';
import { success, error, info, formatOutput } from '../utils';

export function configCommands(program: Command): void {
  const config = program.command('config').description('CLI configuration commands');

  // Get config value
  config
    .command('get <key>')
    .description('Get a configuration value')
    .action((key) => {
      const validKeys = ['apiUrl', 'currentOrg', 'currentProject', 'outputFormat'];
      
      if (!validKeys.includes(key)) {
        error(`Invalid key. Valid keys: ${validKeys.join(', ')}`);
        process.exit(1);
      }

      const value = getConfig(key as any);
      if (value === null || value === undefined) {
        info(`${key}: (not set)`);
      } else {
        info(`${key}: ${value}`);
      }
    });

  // Set config value
  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key, value) => {
      const validKeys = ['apiUrl', 'currentOrg', 'currentProject', 'outputFormat'];
      
      if (!validKeys.includes(key)) {
        error(`Invalid key. Valid keys: ${validKeys.join(', ')}`);
        process.exit(1);
      }

      if (key === 'outputFormat' && !['table', 'json', 'yaml'].includes(value)) {
        error('outputFormat must be one of: table, json, yaml');
        process.exit(1);
      }

      setConfig(key as any, value);
      success(`Set ${key} = ${value}`);
    });

  // List all config
  config
    .command('list')
    .alias('ls')
    .description('List all configuration values')
    .action(() => {
      const values = {
        apiUrl: getConfig('apiUrl'),
        currentOrg: getConfig('currentOrg') || '(not set)',
        currentProject: getConfig('currentProject') || '(not set)',
        outputFormat: getConfig('outputFormat'),
        authenticated: getConfig('token') ? 'Yes' : 'No',
      };

      formatOutput(values);
    });

  // Reset config
  config
    .command('reset')
    .description('Reset all configuration to defaults')
    .action(() => {
      clearConfig();
      success('Configuration reset to defaults');
    });

  // Set API URL shorthand
  config
    .command('api <url>')
    .description('Set the API URL')
    .action((url) => {
      setConfig('apiUrl', url);
      success(`API URL set to: ${url}`);
    });

  // Aliases for common operations
  config
    .command('org <orgId>')
    .description('Set current organization (alias for: config set currentOrg)')
    .action((orgId) => {
      setConfig('currentOrg', orgId);
      success(`Current organization set to: ${orgId}`);
    });

  config
    .command('project <projectId>')
    .description('Set current project (alias for: config set currentProject)')
    .action((projectId) => {
      setConfig('currentProject', projectId);
      success(`Current project set to: ${projectId}`);
    });
}





