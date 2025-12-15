import { Command } from 'commander';
import inquirer from 'inquirer';
import { api } from '../api';
import { getConfig, setConfig } from '../config';
import { success, error, info, spinner, formatOutput, requireAuth, formatStatus, formatDate } from '../utils';

export function clusterCommands(program: Command): void {
  const clusters = program.command('clusters').description('Cluster management commands');

  // List clusters
  clusters
    .command('list')
    .alias('ls')
    .description('List all clusters')
    .option('-p, --project <projectId>', 'Project ID')
    .action(async (options) => {
      if (!requireAuth()) return;

      let projectId = options.project || getConfig('currentProject');

      if (!projectId) {
        error('No project specified. Use --project or run: eutlas config set project <id>');
        process.exit(1);
      }

      spinner.start('Fetching clusters...');
      const result = await api.listClusters(projectId);
      spinner.stop();

      if (!result.success) {
        error(`Failed to list clusters: ${result.error?.message}`);
        process.exit(1);
      }

      if (!result.data || result.data.length === 0) {
        info('No clusters found');
        return;
      }

      const clusters = result.data.map((c: any) => ({
        ID: c.id,
        Name: c.name,
        Status: formatStatus(c.status),
        Plan: c.plan,
        Version: c.mongoVersion,
        Created: formatDate(c.createdAt),
      }));

      formatOutput(clusters, ['ID', 'Name', 'Status', 'Plan', 'Version', 'Created']);
    });

  // Get cluster details
  clusters
    .command('get <clusterId>')
    .description('Get cluster details')
    .option('-p, --project <projectId>', 'Project ID')
    .action(async (clusterId, options) => {
      if (!requireAuth()) return;

      const projectId = options.project || getConfig('currentProject');
      if (!projectId) {
        error('No project specified');
        process.exit(1);
      }

      spinner.start('Fetching cluster...');
      const result = await api.getCluster(projectId, clusterId);
      spinner.stop();

      if (!result.success) {
        error(`Failed to get cluster: ${result.error?.message}`);
        process.exit(1);
      }

      formatOutput(result.data);
    });

  // Create cluster
  clusters
    .command('create')
    .description('Create a new cluster')
    .option('-p, --project <projectId>', 'Project ID')
    .option('-n, --name <name>', 'Cluster name')
    .option('--plan <plan>', 'Plan (DEV, SMALL, MEDIUM, LARGE, XLARGE)')
    .option('--version <version>', 'MongoDB version')
    .option('--region <region>', 'Region')
    .action(async (options) => {
      if (!requireAuth()) return;

      let { project, name, plan, version, region } = options;
      project = project || getConfig('currentProject');

      if (!project) {
        error('No project specified');
        process.exit(1);
      }

      // Interactive prompts for missing options
      const questions = [];
      if (!name) {
        questions.push({
          type: 'input',
          name: 'name',
          message: 'Cluster name:',
          validate: (input: string) => input.length >= 3 || 'Name must be at least 3 characters',
        });
      }
      if (!plan) {
        questions.push({
          type: 'list',
          name: 'plan',
          message: 'Plan:',
          choices: [
            { name: 'DEV (512MB RAM, €9/mo)', value: 'DEV' },
            { name: 'SMALL (1GB RAM, €29/mo)', value: 'SMALL' },
            { name: 'MEDIUM (2GB RAM, €59/mo)', value: 'MEDIUM' },
            { name: 'LARGE (4GB RAM, €119/mo)', value: 'LARGE' },
            { name: 'XLARGE (8GB RAM, €229/mo)', value: 'XLARGE' },
          ],
        });
      }

      if (questions.length > 0) {
        const answers = await inquirer.prompt(questions);
        name = name || answers.name;
        plan = plan || answers.plan;
      }

      spinner.start('Creating cluster...');
      const result = await api.createCluster(project, {
        name,
        plan,
        mongoVersion: version || '7.0',
        region,
      });
      spinner.stop();

      if (!result.success) {
        error(`Failed to create cluster: ${result.error?.message}`);
        process.exit(1);
      }

      success(`Cluster "${name}" created!`);
      info(`ID: ${result.data.id}`);
      info('Cluster is provisioning. Check status with: eutlas clusters get ' + result.data.id);
    });

  // Resize cluster
  clusters
    .command('resize <clusterId>')
    .description('Resize a cluster')
    .option('-p, --project <projectId>', 'Project ID')
    .option('--plan <plan>', 'New plan')
    .action(async (clusterId, options) => {
      if (!requireAuth()) return;

      const projectId = options.project || getConfig('currentProject');
      if (!projectId) {
        error('No project specified');
        process.exit(1);
      }

      let { plan } = options;

      if (!plan) {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'plan',
            message: 'New plan:',
            choices: ['DEV', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'],
          },
        ]);
        plan = answers.plan;
      }

      spinner.start('Resizing cluster...');
      const result = await api.resizeCluster(projectId, clusterId, plan);
      spinner.stop();

      if (!result.success) {
        error(`Failed to resize cluster: ${result.error?.message}`);
        process.exit(1);
      }

      success(`Cluster resize initiated to ${plan}`);
    });

  // Delete cluster
  clusters
    .command('delete <clusterId>')
    .description('Delete a cluster')
    .option('-p, --project <projectId>', 'Project ID')
    .option('-f, --force', 'Skip confirmation')
    .action(async (clusterId, options) => {
      if (!requireAuth()) return;

      const projectId = options.project || getConfig('currentProject');
      if (!projectId) {
        error('No project specified');
        process.exit(1);
      }

      if (!options.force) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Are you sure you want to delete this cluster? This action cannot be undone.',
            default: false,
          },
        ]);

        if (!confirm) {
          info('Operation cancelled');
          return;
        }
      }

      spinner.start('Deleting cluster...');
      const result = await api.deleteCluster(projectId, clusterId);
      spinner.stop();

      if (!result.success) {
        error(`Failed to delete cluster: ${result.error?.message}`);
        process.exit(1);
      }

      success('Cluster deletion initiated');
    });

  // Pause cluster
  clusters
    .command('pause <clusterId>')
    .description('Pause a cluster')
    .option('-p, --project <projectId>', 'Project ID')
    .action(async (clusterId, options) => {
      if (!requireAuth()) return;

      const projectId = options.project || getConfig('currentProject');
      if (!projectId) {
        error('No project specified');
        process.exit(1);
      }

      spinner.start('Pausing cluster...');
      const result = await api.pauseCluster(projectId, clusterId);
      spinner.stop();

      if (!result.success) {
        error(`Failed to pause cluster: ${result.error?.message}`);
        process.exit(1);
      }

      success('Cluster pause initiated');
    });

  // Resume cluster
  clusters
    .command('resume <clusterId>')
    .description('Resume a paused cluster')
    .option('-p, --project <projectId>', 'Project ID')
    .action(async (clusterId, options) => {
      if (!requireAuth()) return;

      const projectId = options.project || getConfig('currentProject');
      if (!projectId) {
        error('No project specified');
        process.exit(1);
      }

      spinner.start('Resuming cluster...');
      const result = await api.resumeCluster(projectId, clusterId);
      spinner.stop();

      if (!result.success) {
        error(`Failed to resume cluster: ${result.error?.message}`);
        process.exit(1);
      }

      success('Cluster resume initiated');
    });

  // Get connection string
  clusters
    .command('connect <clusterId>')
    .description('Get connection string for a cluster')
    .option('-p, --project <projectId>', 'Project ID')
    .action(async (clusterId, options) => {
      if (!requireAuth()) return;

      const projectId = options.project || getConfig('currentProject');
      if (!projectId) {
        error('No project specified');
        process.exit(1);
      }

      spinner.start('Fetching credentials...');
      const result = await api.getClusterCredentials(projectId, clusterId);
      spinner.stop();

      if (!result.success) {
        error(`Failed to get credentials: ${result.error?.message}`);
        process.exit(1);
      }

      console.log('\nConnection String:');
      console.log(result.data.connectionString);
      console.log('\nHost:', result.data.host);
      console.log('Port:', result.data.port);
    });
}





