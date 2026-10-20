#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { runInit } from './commands/init.js';
import { runStatus } from './commands/status.js';
import { runDestroy } from './commands/destroy.js';
import { handleError } from './utils/errors.js';

import { createRequire } from 'node:module';

// Read the real version from package.json so `--version` can never drift from
// the published artifact. Works from src/ (tsx dev) and dist/ (published) since
// both sit one level below the package root.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkgJson = require('../package.json') as { version: string; name: string };

const program = new Command();

program
  .name('secureagentbase')
  .description('SecureAgentBase CLI')
  .version(pkgJson.version);

program
  .command('init')
  .description('Run the setup wizard')
  .option('--project-id <id>', 'GCP project ID (skips project selection)')
  .option('--auto-sa', 'Create service account automatically (skips SA prompt)')
  .option('--no-firebase', 'Skip Firebase setup')
  .option('--billing-account <id>', 'Billing account ID (skips billing prompt)')
  .option('--github-pat <token>', 'GitHub PAT (skips PAT prompt) — prefer env SECUREAGENTBASE_GITHUB_PAT')
  .option('--repo-name <name>', 'GitHub repo name (requires --github-pat)')
  .option('--discord-token <token>', 'Discord bot token — prefer env SECUREAGENTBASE_DISCORD_TOKEN')
  .option('--discord-guild <id>', 'Discord guild ID')
  .option('--vm-zone <zone>', 'VM zone (default: us-central1-a, falls back across regions)')
  .option('--no-vm', 'Skip VM creation')
  .option('-y, --yes', 'Skip all confirmations (non-interactive mode)')
  .action(async (opts) => {
    try {
      // Secrets may be supplied through the environment instead of argv.
      // argv is exposed to `ps`, shell history, and any CI log that echoes
      // the command; environment variables are not, and GitHub Actions masks
      // values it injects as secrets. Explicit flags still win so existing
      // automation is unaffected.
      const githubPat = opts.githubPat || process.env.SECUREAGENTBASE_GITHUB_PAT;
      const discordToken = opts.discordToken || process.env.SECUREAGENTBASE_DISCORD_TOKEN;
      if (opts.githubPat) {
        process.stderr.write(
          'warning: --github-pat is visible in `ps` and shell history; prefer the SECUREAGENTBASE_GITHUB_PAT environment variable.\n',
        );
      }
      if (opts.discordToken) {
        process.stderr.write(
          'warning: --discord-token is visible in `ps` and shell history; prefer the SECUREAGENTBASE_DISCORD_TOKEN environment variable.\n',
        );
      }

      await runInit({
        projectId: opts.projectId,
        autoSa: opts.autoSa,
        firebase: opts.firebase !== false,
        billingAccount: opts.billingAccount,
        githubPat,
        repoName: opts.repoName,
        discordToken,
        discordGuild: opts.discordGuild,
        vmZone: opts.vmZone,
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
  .action(async (opts) => {
    try {
      await runDestroy({ yes: opts.yes });
    } catch (err) {
      handleError(err);
    }
  });

program.parse(process.argv);
