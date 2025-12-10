import { Command } from 'commander';
import inquirer from 'inquirer';
import { api } from '../api';
import { setConfig, clearConfig, getConfig } from '../config';
import { success, error, info, spinner, formatOutput } from '../utils';

export function authCommands(program: Command): void {
  const auth = program.command('auth').description('Authentication commands');

  // Login
  auth
    .command('login')
    .description('Log in to EUTLAS')
    .option('-e, --email <email>', 'Email address')
    .option('-p, --password <password>', 'Password')
    .action(async (options) => {
      let { email, password } = options;

      if (!email || !password) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'email',
            message: 'Email:',
            when: !email,
          },
          {
            type: 'password',
            name: 'password',
            message: 'Password:',
            when: !password,
          },
        ]);
        email = email || answers.email;
        password = password || answers.password;
      }

      spinner.start('Logging in...');

      const result = await api.login(email, password);

      if (!result.success) {
        spinner.stop();
        error(`Login failed: ${result.error?.message}`);
        process.exit(1);
      }

      setConfig('token', result.data.accessToken);
      spinner.stop();
      success(`Logged in as ${email}`);
    });

  // Logout
  auth
    .command('logout')
    .description('Log out of EUTLAS')
    .action(() => {
      setConfig('token', null);
      success('Logged out successfully');
    });

  // Signup
  auth
    .command('signup')
    .description('Create a new EUTLAS account')
    .action(async () => {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'firstName',
          message: 'First name:',
        },
        {
          type: 'input',
          name: 'lastName',
          message: 'Last name:',
        },
        {
          type: 'input',
          name: 'email',
          message: 'Email:',
        },
        {
          type: 'password',
          name: 'password',
          message: 'Password:',
        },
        {
          type: 'password',
          name: 'confirmPassword',
          message: 'Confirm password:',
        },
      ]);

      if (answers.password !== answers.confirmPassword) {
        error('Passwords do not match');
        process.exit(1);
      }

      spinner.start('Creating account...');

      const result = await api.signup(
        answers.email,
        answers.password,
        answers.firstName,
        answers.lastName
      );

      if (!result.success) {
        spinner.stop();
        error(`Signup failed: ${result.error?.message}`);
        process.exit(1);
      }

      setConfig('token', result.data.accessToken);
      spinner.stop();
      success('Account created successfully!');
      info('You are now logged in.');
    });

  // Whoami
  auth
    .command('whoami')
    .description('Show current user')
    .action(async () => {
      const token = getConfig('token');
      if (!token) {
        error('Not logged in');
        process.exit(1);
      }

      spinner.start('Fetching profile...');
      const result = await api.getProfile();
      spinner.stop();

      if (!result.success) {
        error(`Failed to get profile: ${result.error?.message}`);
        process.exit(1);
      }

      formatOutput({
        Email: result.data.email,
        Name: `${result.data.firstName} ${result.data.lastName}`,
        ID: result.data.id,
      });
    });

  // Status
  auth
    .command('status')
    .description('Show authentication status')
    .action(() => {
      const token = getConfig('token');
      const apiUrl = getConfig('apiUrl');

      if (token) {
        success('Authenticated');
      } else {
        info('Not authenticated');
      }
      info(`API URL: ${apiUrl}`);
    });
}


