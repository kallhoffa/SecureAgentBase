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
  .description('Run the setup wizard')
  .option('--sa-key <path>', 'Path to a service account JSON key')
  .option('--project-id <id>', 'GCP project ID (skips project selection)')
  .option('--auto-sa', 'Create service account automatically (skips SA prompt)')
  .option('--no-firebase', 'Skip Firebase setup')
  .option('--billing-account <id>', 'Billing account ID (skips billing prompt)')
  .option('--github-pat <token>', 'GitHub PAT (skips PAT prompt)')
  .option('--repo-name <name>', 'GitHub repo name (requires --github-pat)')
  .option('--discord-token <token>', 'Discord bot token')
  .option('--discord-guild <id>', 'Discord guild ID')
  .option('--vm-zone <zone>', 'VM zone (default: us-central1-a)')
  .option('--no-vm', 'Skip VM creation')
  .option('-y, --yes', 'Skip all confirmations (non-interactive mode)')
  .action(async (opts) => {
    try {
      await runInit({
        saKey: opts.saKey,
        projectId: opts.projectId,
        autoSa: opts.autoSa,
        firebase: opts.firebase !== false,
        billingAccount: opts.billingAccount,
        githubPat: opts.githubPat,
        repoName: opts.repoName,
        discordToken: opts.discordToken,
        discordGuild: opts.discordGuild,
        vmZone: opts.vmZone || 'us-central1-a',
        yes: opts.yes,
        vm: opts.vm,
      });
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
