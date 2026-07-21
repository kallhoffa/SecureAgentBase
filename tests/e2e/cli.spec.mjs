/**
 * CLI E2E tests
 *
 * Uses the packaged CLI (secureagentbase-*.tgz) installed from the CI artifact.
 * Requires env vars:
 *   CLI_PACKAGE    - path to the .tgz package (set by CI)
 *   GCP_PROJECT_ID - project to test against (agentbase-test-staging)
 *   SA_KEY_PATH    - path to service account key file for e2e-test-runner
 *   SKIP_CLEANUP   - set to "true" to keep created resources for debugging
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const SKIP = '\x1b[33m∘\x1b[0m';

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ${PASS} ${msg}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${msg}`);
    failed++;
  }
}

function run(bin, args, opts = {}) {
  const result = spawnSync(bin, args, {
    cwd: opts.cwd || process.cwd(),
    env: { ...process.env, ...opts.env },
    stdio: 'pipe',
    timeout: opts.timeout || 120_000,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout?.toString() || '',
    stderr: result.stderr?.toString() || '',
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const cliPackage = process.env.CLI_PACKAGE;
  const projectId = process.env.GCP_PROJECT_ID || process.env.E2E_GCP_PROJECT_ID;
  const skipCleanup = process.env.SKIP_CLEANUP === 'true';

  if (!cliPackage) {
    console.log(`${SKIP} CLI_E2E: CLI_PACKAGE not set, skipping`);
    skipped++;
    console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    process.exit(failed > 0 ? 1 : 0);
  }

  if (!projectId) {
    console.log(`${SKIP} CLI_E2E: GCP_PROJECT_ID not set, skipping`);
    skipped++;
    console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    process.exit(failed > 0 ? 1 : 0);
  }

  if (!process.env.SA_KEY_PATH || !existsSync(process.env.SA_KEY_PATH)) {
    console.log(`${SKIP} CLI_E2E: SA_KEY_PATH not set or file missing, skipping`);
    skipped++;
    console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    process.exit(failed > 0 ? 1 : 0);
  }
  const saKeyPath = resolve(process.env.SA_KEY_PATH);

  // Install CLI from package in a temp directory
  const tmpDir = mkdtempSync(join(tmpdir(), 'cli-e2e-'));
  const homeDir = join(tmpDir, 'home');
  const configDir = join(homeDir, '.config', 'secureagentbase');
  console.log(`\nCLI E2E (project: ${projectId})`);

  // Resolve the package path relative to the workspace
  const pkgPath = resolve(cliPackage);
  if (!existsSync(pkgPath)) {
    console.log(`${FAIL} Package not found at ${pkgPath}`);
    failed++;
    process.exit(1);
  }

  // Install
  console.log(`  Installing ${pkgPath}...`);
  const install = run('npm', ['install', '-g', pkgPath], {
    cwd: tmpDir,
    timeout: 60_000,
    env: { npm_config_prefix: join(tmpDir, 'npm-global') },
  });

  if (install.exitCode !== 0) {
    console.log(install.stderr || install.stdout);
    console.log(`${FAIL} CLI installation failed`);
    failed++;
    process.exit(1);
  }

  const npmBin = join(tmpDir, 'npm-global', 'bin');
  const cliBin = join(npmBin, 'secureagentbase');

  // Ensure the CLI binary exists
  if (!existsSync(cliBin)) {
    console.log(`${FAIL} CLI binary not found at ${cliBin}`);
    failed++;
    process.exit(1);
  }

  console.log(`  CLI installed at ${cliBin}\n`);

  const envBase = {
    HOME: homeDir,
    PATH: `${npmBin}:${process.env.PATH}`,
    XDG_CONFIG_HOME: join(homeDir, '.config'),
  };

  // Test 1: Status (no config yet)
  console.log('Test 1: status — no config');
  let r = run(cliBin, ['status'], { env: envBase });
  assert(r.exitCode === 0, 'status exits with 0');
  assert(r.stdout.includes('No deployment found') || r.stdout.includes('SecureAgentBase Status'), 'status shows no deployment');

  // Test 2: Init with --project-id and --auto-sa (non-interactive headless)
  console.log('Test 2: init — minimal headless');
  {
    r = run(cliBin, [
      'init',
      '--project-id', projectId,
      '--auto-sa',
      '--no-firebase',
      '--sa-key', saKeyPath,
    ], { env: envBase, timeout: 180_000 });

    if (r.exitCode === 0) {
      assert(true, 'init completes successfully');
    } else {
      // Show details on failure
      console.log(`  exit code: ${r.exitCode}`);
      if (r.stdout) console.log(`  stdout:\n${r.stdout}`);
      if (r.stderr) console.log(`  stderr:\n${r.stderr}`);
      assert(false, 'init completes successfully');
    }
  }

  // Test 3: Status after init
  console.log('Test 3: status — after init');
  r = run(cliBin, ['status'], { env: envBase });
  assert(r.exitCode === 0, 'status exits with 0');
  assert(r.stdout.includes(projectId), 'status shows project ID');
  assert(r.stdout.includes('secureagent-manager'), 'status shows service account');

  // Test 4: Destroy (cleanup)
  if (!skipCleanup) {
    console.log('Test 4: destroy — cleanup');
    r = run(cliBin, ['destroy', '-y', '--sa-key', saKeyPath], { env: envBase, timeout: 60_000 });
    console.log(`  ${r.stdout}`);
    assert(true, 'destroy ran');

    // Test 5: Status after destroy
    console.log('Test 5: status — after destroy');
    r = run(cliBin, ['status'], { env: envBase });
    assert(r.stdout.includes('No deployment found'), 'status shows no deployment after destroy');
  } else {
    console.log(`  ${SKIP} destroy (SKIP_CLEANUP=true)`);
    skipped++;
  }

  // Summary
  console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
