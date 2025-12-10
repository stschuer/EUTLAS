#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { authCommands } from './commands/auth';
import { orgCommands } from './commands/orgs';
import { projectCommands } from './commands/projects';
import { clusterCommands } from './commands/clusters';
import { configCommands } from './commands/config';

const program = new Command();

// CLI Header
console.log(chalk.cyan(`
╔═══════════════════════════════════════╗
║         EUTLAS CLI v0.1.0             ║
║   EU MongoDB Atlas Alternative        ║
╚═══════════════════════════════════════╝
`));

program
  .name('eutlas')
  .description('EUTLAS CLI - Manage your MongoDB clusters from the terminal')
  .version('0.1.0');

// Register commands
authCommands(program);
orgCommands(program);
projectCommands(program);
clusterCommands(program);
configCommands(program);

// Quick commands
program
  .command('login')
  .description('Quick login (alias for: auth login)')
  .action(() => {
    program.commands.find(c => c.name() === 'auth')
      ?.commands.find(c => c.name() === 'login')
      ?.parseAsync(process.argv.slice(2));
  });

program
  .command('logout')
  .description('Quick logout (alias for: auth logout)')
  .action(() => {
    program.commands.find(c => c.name() === 'auth')
      ?.commands.find(c => c.name() === 'logout')
      ?.parseAsync([]);
  });

// Help examples
program.addHelpText('after', `

${chalk.bold('Examples:')}
  ${chalk.gray('# Login to EUTLAS')}
  $ eutlas auth login

  ${chalk.gray('# List organizations')}
  $ eutlas orgs list

  ${chalk.gray('# Set current project')}
  $ eutlas projects use <projectId>

  ${chalk.gray('# Create a cluster')}
  $ eutlas clusters create --name my-cluster --plan SMALL

  ${chalk.gray('# Get connection string')}
  $ eutlas clusters connect <clusterId>

  ${chalk.gray('# Output as JSON')}
  $ eutlas config set outputFormat json
  $ eutlas clusters list

${chalk.bold('Configuration:')}
  Config is stored at: ~/.config/eutlas-cli/config.json
`);

program.parse();


