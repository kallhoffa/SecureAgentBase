#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { runInit } from './commands/init.js';
import { runStatus } from './commands/status.js';
import { runDestroy } from './commands/destroy.js';
import { handleError } from './utils/errors.js';

const pkg = { version: '0.1.0', name: 'secureagentbase' };

const program = new Command();

program
  .name('secureagentbase')
  .description('CLI to deploy and manage SecureAgentBase on GCP')
  .version(pkg.version);

program
  .command('init')
  .description('Run the interactive setup wizard')
  .option('--sa-key <path>', 'Path to a service account JSON key')
  .action(async (opts) => {
    try {
      await runInit({ saKey: opts.saKey });
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('status')
  .description('Show deployment status')
  .action(async () => {
    try {
      await runStatus();
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('destroy')
  .description('Delete VM and clear configuration')
  .option('-y, --yes', 'Skip confirmation')
  .option('--sa-key <path>', 'Path to a service account JSON key')
  .action(async (opts) => {
    try {
      await runDestroy({ yes: opts.yes, saKey: opts.saKey });
    } catch (err) {
      handleError(err);
    }
  });

program.parse(process.argv);
