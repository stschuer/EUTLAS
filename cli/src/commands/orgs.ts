import { Command } from 'commander';
import inquirer from 'inquirer';
import { api } from '../api';
import { setConfig, getConfig } from '../config';
import { success, error, info, spinner, formatOutput, requireAuth, formatDate } from '../utils';

export function orgCommands(program: Command): void {
  const orgs = program.command('orgs').description('Organization management commands');

  // List organizations
  orgs
    .command('list')
    .alias('ls')
    .description('List all organizations')
    .action(async () => {
      if (!requireAuth()) return;

      spinner.start('Fetching organizations...');
      const result = await api.listOrgs();
      spinner.stop();

      if (!result.success) {
        error(`Failed to list organizations: ${result.error?.message}`);
        process.exit(1);
      }

      if (!result.data || result.data.length === 0) {
        info('No organizations found');
        return;
      }

      const currentOrg = getConfig('currentOrg');
      const orgs = result.data.map((o: any) => ({
        ID: o.id,
        Name: o.name,
        Role: o.role || '-',
        Current: o.id === currentOrg ? '✓' : '',
      }));

      formatOutput(orgs, ['ID', 'Name', 'Role', 'Current']);
    });

  // Get organization details
  orgs
    .command('get <orgId>')
    .description('Get organization details')
    .action(async (orgId) => {
      if (!requireAuth()) return;

      spinner.start('Fetching organization...');
      const result = await api.getOrg(orgId);
      spinner.stop();

      if (!result.success) {
        error(`Failed to get organization: ${result.error?.message}`);
        process.exit(1);
      }

      formatOutput(result.data);
    });

  // Create organization
  orgs
    .command('create')
    .description('Create a new organization')
    .option('-n, --name <name>', 'Organization name')
    .action(async (options) => {
      if (!requireAuth()) return;

      let { name } = options;

      if (!name) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Organization name:',
            validate: (input: string) => input.length >= 2 || 'Name must be at least 2 characters',
          },
        ]);
        name = answers.name;
      }

      spinner.start('Creating organization...');
      const result = await api.createOrg(name);
      spinner.stop();

      if (!result.success) {
        error(`Failed to create organization: ${result.error?.message}`);
        process.exit(1);
      }

      success(`Organization "${name}" created!`);
      info(`ID: ${result.data.id}`);

      // Set as current org
      const { setCurrent } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'setCurrent',
          message: 'Set as current organization?',
          default: true,
        },
      ]);

      if (setCurrent) {
        setConfig('currentOrg', result.data.id);
        success('Set as current organization');
      }
    });

  // Use organization
  orgs
    .command('use <orgId>')
    .description('Set current organization')
    .action(async (orgId) => {
      if (!requireAuth()) return;

      // Verify org exists
      spinner.start('Verifying organization...');
      const result = await api.getOrg(orgId);
      spinner.stop();

      if (!result.success) {
        error(`Organization not found: ${result.error?.message}`);
        process.exit(1);
      }

      setConfig('currentOrg', orgId);
      success(`Now using organization: ${result.data.name}`);
    });

  // Current organization
  orgs
    .command('current')
    .description('Show current organization')
    .action(async () => {
      const orgId = getConfig('currentOrg');
      if (!orgId) {
        info('No organization selected');
        info('Select one with: eutlas orgs use <orgId>');
        return;
      }

      if (!requireAuth()) return;

      spinner.start('Fetching organization...');
      const result = await api.getOrg(orgId);
      spinner.stop();

      if (!result.success) {
        error('Current organization not found');
        setConfig('currentOrg', null);
        return;
      }

      success(`Current organization: ${result.data.name} (${orgId})`);
    });
}



