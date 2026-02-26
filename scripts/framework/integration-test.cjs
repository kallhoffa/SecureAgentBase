const { execSync, exec } = require('child_process');
const util = require('util');
const path = require('path');

const execPromise = util.promisify(exec);

const MAX_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 10000;

const DEFAULT_CONFIG = {
  maxRetries: MAX_ATTEMPTS,
  testUrl: 'https://argbase-staging.web.app',
  timeout: 60000,
};

function loadConfig() {
  try {
    const configPath = path.join(__dirname, '..', 'config', 'automation.json');
    const fs = require('fs');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return {
        maxRetries: config.maxRetries?.integrationTests || DEFAULT_CONFIG.maxRetries,
        testUrl: config.integrationTestUrl || DEFAULT_CONFIG.testUrl,
        timeout: DEFAULT_CONFIG.timeout,
      };
    }
  } catch (e) {
    console.log('Using default config:', e.message);
  }
  return DEFAULT_CONFIG;
}

async function run(cmd, options = {}) {
  try {
    const stdout = execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...options });
    return { stdout, stderr: '', error: null };
  } catch (e) {
    return { stdout: e.stdout || '', stderr: e.stderr || '', error: e };
  }
}

function parseTestErrors(output) {
  const errors = [];

  const failedPattern = /(\d+) failed/gi;
  let match;
  while ((match = failedPattern.exec(output)) !== null) {
    errors.push({ type: 'test', count: parseInt(match[1]) });
  }

  const failedTestPattern = /✗\s+(.+)/gi;
  const failedTests = [];
  while ((match = failedTestPattern.exec(output)) !== null) {
    failedTests.push(match[1]);
  }
  if (failedTests.length > 0) {
    errors.push({ type: 'failedTests', tests: failedTests });
  }

  const timeoutPattern = /(\d+) timed out/gi;
  while ((match = timeoutPattern.exec(output)) !== null) {
    errors.push({ type: 'timeout', count: parseInt(match[1]) });
  }

  return errors;
}

async function runTests(config, attempt = 1) {
  console.log(`\n--- Running integration tests (attempt ${attempt}/${config.maxRetries}) ---`);

  const testCommand = `npx playwright test --reporter=list`;

  try {
    const { stdout, stderr, error } = await run(testCommand, { 
      timeout: config.timeout,
      env: { ...process.env, TEST_URL: config.testUrl }
    });
    
    console.log(stdout);

    if (error) {
      console.log('Test run had errors:', error.message);
      const errors = parseTestErrors(stdout + stderr);

      if (errors.length === 0) {
        console.log('Could not parse test errors from output.');
        console.log('\n--- Last 30 lines of output ---');
        const lines = (stdout + stderr).split('\n');
        console.log(lines.slice(-30).join('\n'));
        return { success: false, fixed: false };
      }

      console.log('Detected test failures:', errors.map(e => e.type).join(', '));

      const canRetry = attempt < config.maxRetries;
      if (canRetry) {
        console.log(`Retrying tests (${attempt}/${config.maxRetries})...`);
        return runTests(config, attempt + 1);
      }

      return { success: false, fixed: false };
    }

    console.log('All integration tests passed!');
    return { success: true, fixed: false };

  } catch (e) {
    console.log('Test execution error:', e.message);
    if (attempt < config.maxRetries) {
      console.log(`Retrying after error...`);
      return runTests(config, attempt + 1);
    }
    return { success: false, fixed: false };
  }
}

async function installPlaywright() {
  const result = await run('npx playwright --version');
  if (result.error) {
    console.log('Installing Playwright...');
    await run('npm install -D @playwright/test');
    await run('npx playwright install chromium');
  }
}

async function integrationTest() {
  console.log('=== Integration Tests ===\n');

  const config = loadConfig();
  console.log('Config:', JSON.stringify(config, null, 2));

  await installPlaywright();

  const result = await runTests(config);

  if (result.success) {
    console.log('\n✓ Integration tests passed!');
    return true;
  } else {
    console.log('\n✗ Integration tests failed.');
    return false;
  }
}

integrationTest()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Integration test error:', err);
    process.exit(1);
  });
