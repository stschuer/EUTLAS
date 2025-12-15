import { Command } from 'commander';
import inquirer from 'inquirer';
import { api } from '../api';
import { setConfig, getConfig } from '../config';
import { success, error, info, spinner, formatOutput, requireAuth, formatDate } from '../utils';

export function projectCommands(program: Command): void {
  const projects = program.command('projects').description('Project management commands');

  // List projects
  projects
    .command('list')
    .alias('ls')
    .description('List all projects')
    .option('-o, --org <orgId>', 'Organization ID')
    .action(async (options) => {
      if (!requireAuth()) return;

      const orgId = options.org || getConfig('currentOrg');

      if (!orgId) {
        error('No organization specified. Use --org or run: eutlas orgs use <id>');
        process.exit(1);
      }

      spinner.start('Fetching projects...');
      const result = await api.listProjects(orgId);
      spinner.stop();

      if (!result.success) {
        error(`Failed to list projects: ${result.error?.message}`);
        process.exit(1);
      }

      if (!result.data || result.data.length === 0) {
        info('No projects found');
        return;
      }

      const currentProject = getConfig('currentProject');
      const projects = result.data.map((p: any) => ({
        ID: p.id,
        Name: p.name,
        Clusters: p.clusterCount || 0,
        Created: formatDate(p.createdAt),
        Current: p.id === currentProject ? '✓' : '',
      }));

      formatOutput(projects, ['ID', 'Name', 'Clusters', 'Created', 'Current']);
    });

  // Get project details
  projects
    .command('get <projectId>')
    .description('Get project details')
    .action(async (projectId) => {
      if (!requireAuth()) return;

      spinner.start('Fetching project...');
      const result = await api.getProject(projectId);
      spinner.stop();

      if (!result.success) {
        error(`Failed to get project: ${result.error?.message}`);
        process.exit(1);
      }

      formatOutput(result.data);
    });

  // Create project
  projects
    .command('create')
    .description('Create a new project')
    .option('-o, --org <orgId>', 'Organization ID')
    .option('-n, --name <name>', 'Project name')
    .option('-d, --description <description>', 'Project description')
    .action(async (options) => {
      if (!requireAuth()) return;

      let { org, name, description } = options;
      org = org || getConfig('currentOrg');

      if (!org) {
        error('No organization specified');
        process.exit(1);
      }

      if (!name) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Project name:',
            validate: (input: string) => input.length >= 2 || 'Name must be at least 2 characters',
          },
          {
            type: 'input',
            name: 'description',
            message: 'Description (optional):',
          },
        ]);
        name = answers.name;
        description = answers.description || description;
      }

      spinner.start('Creating project...');
      const result = await api.createProject(org, name, description);
      spinner.stop();

      if (!result.success) {
        error(`Failed to create project: ${result.error?.message}`);
        process.exit(1);
      }

      success(`Project "${name}" created!`);
      info(`ID: ${result.data.id}`);

      // Set as current project
      const { setCurrent } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'setCurrent',
          message: 'Set as current project?',
          default: true,
        },
      ]);

      if (setCurrent) {
        setConfig('currentProject', result.data.id);
        success('Set as current project');
      }
    });

  // Use project
  projects
    .command('use <projectId>')
    .description('Set current project')
    .action(async (projectId) => {
      if (!requireAuth()) return;

      spinner.start('Verifying project...');
      const result = await api.getProject(projectId);
      spinner.stop();

      if (!result.success) {
        error(`Project not found: ${result.error?.message}`);
        process.exit(1);
      }

      setConfig('currentProject', projectId);
      success(`Now using project: ${result.data.name}`);
    });

  // Current project
  projects
    .command('current')
    .description('Show current project')
    .action(async () => {
      const projectId = getConfig('currentProject');
      if (!projectId) {
        info('No project selected');
        info('Select one with: eutlas projects use <projectId>');
        return;
      }

      if (!requireAuth()) return;

      spinner.start('Fetching project...');
      const result = await api.getProject(projectId);
      spinner.stop();

      if (!result.success) {
        error('Current project not found');
        setConfig('currentProject', null);
        return;
      }

      success(`Current project: ${result.data.name} (${projectId})`);
    });
}





