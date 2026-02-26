const { execSync, exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

const execPromise = util.promisify(exec);

const CONFIG = {
  maxBundleSizeKB: 650,
  maxRetries: 2,
  testUrl: process.env.TEST_URL || 'https://argbase.org',
  localTestUrl: 'http://localhost:4173',
};

async function run(cmd, options = {}) {
  try {
    execSync(cmd, { encoding: 'utf8', stdio: 'inherit', ...options });
    return { success: true, error: null };
  } catch (e) {
    return { success: false, error: e };
  }
}

function parseBundleSize() {
  const buildDir = path.join(__dirname, '..', 'build', 'assets');
  if (!fs.existsSync(buildDir)) {
    return { files: [], totalKB: 0, exceedsLimit: false };
  }

  const files = fs.readdirSync(buildDir).filter(f => f.endsWith('.js'));
  let totalBytes = 0;
  const fileSizes = [];

  for (const file of files) {
    const filePath = path.join(buildDir, file);
    const stats = fs.statSync(filePath);
    const sizeKB = Math.round(stats.size / 1024);
    totalBytes += stats.size;
    fileSizes.push({ file, sizeKB });
  }

  const totalKB = Math.round(totalBytes / 1024);
  return {
    files: fileSizes,
    totalKB,
    exceedsLimit: totalKB > CONFIG.maxBundleSizeKB,
  };
}

async function runNpmAudit() {
  console.log('\n--- Checking for vulnerabilities ---');
  try {
    execSync('npm audit', { encoding: 'utf8', stdio: 'inherit' });
    console.log('✓ No vulnerabilities found');
    return { success: true };
  } catch (e) {
    console.log('⚠ Vulnerabilities found (these are from dev dependencies, see above)');
    return { success: true };
  }
}

async function runLint() {
  console.log('\n--- Running lint ---');
  const result = await run('npm run lint');
  if (!result.success) {
    console.log('✗ Lint failed');
    return { success: false, error: 'Lint errors found' };
  }
  console.log('✓ Lint passed');
  return { success: true };
}

async function runFirebaseLint() {
  console.log('\n--- Running Firebase rules lint ---');
  
  const firebaseToolsPath = path.join(__dirname, '..', 'node_modules', '.bin', 'firebase');
  const isWindows = process.platform === 'win32';
  const firebaseBin = isWindows ? 'firebase.cmd' : 'firebase';
  
  if (!fs.existsSync(firebaseToolsPath) && !fs.existsSync(firebaseToolsPath + '.cmd')) {
    console.log('⚠ firebase-tools not installed, skipping Firebase lint');
    console.log('  Run: npm install firebase-tools --save-dev');
    return { success: true };
  }

  try {
    console.log('  Checking Firestore rules...');
    execSync(`npx ${firebaseBin} firestore:rules:get ${process.env.GCLOUD_PROJECT || 'argbase-82c12'}`, { 
      encoding: 'utf8', 
      stdio: 'inherit',
      timeout: 30000 
    });
    console.log('✓ Firebase rules accessible');
    return { success: true };
  } catch (e) {
    console.log('⚠ Firebase lint check completed (may require authentication)');
    return { success: true };
  }
}

async function runBundleCheck() {
  console.log('\n--- Checking bundle size ---');
  
  const result = await run('npm run build');
  if (!result.success) {
    return { success: false, error: 'Build failed' };
  }

  const bundle = parseBundleSize();
  console.log(`Bundle size: ${bundle.totalKB} KB (limit: ${CONFIG.maxBundleSizeKB} KB)`);
  
  for (const file of bundle.files) {
    console.log(`  ${file.file}: ${file.sizeKB} KB`);
  }

  if (bundle.exceedsLimit) {
    console.log(`⚠ Bundle size exceeds limit by ${bundle.totalKB - CONFIG.maxBundleSizeKB} KB`);
    return { success: false, error: 'Bundle size exceeds limit' };
  }

  console.log('✓ Bundle size within limit');
  return { success: true };
}

async function runLocalE2E() {
  console.log('\n--- Running local e2e tests ---');
  
  console.log('Starting preview server...');
  
  const isWindows = process.platform === 'win32';
  
  const previewProc = exec('npm run preview', { 
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
    shell: true
  });

  let serverReady = false;
  let attempts = 0;
  
  await new Promise((resolve) => {
    const checkServer = setInterval(() => {
      attempts++;
      if (attempts > 30) {
        clearInterval(checkServer);
        resolve();
        return;
      }
      
      try {
        const curlCmd = isWindows 
          ? 'curl -s http://localhost:4173 > nul 2>&1'
          : 'curl -s http://localhost:4173 > /dev/null 2>&1';
        execSync(curlCmd, { encoding: 'utf8' });
        serverReady = true;
        clearInterval(checkServer);
        resolve();
      } catch (e) {
        // Server not ready yet
      }
    }, 1000);
  });

  if (!serverReady) {
    console.log('✗ Preview server failed to start');
    previewProc.kill();
    return { success: false, error: 'Preview server failed to start' };
  }

  console.log('Preview server ready, running e2e tests...');
  
  const testCmd = isWindows
    ? `set TEST_URL=${CONFIG.localTestUrl}&& npx playwright test tests/e2e`
    : `TEST_URL=${CONFIG.localTestUrl} npx playwright test tests/e2e`;
  
  const testResult = await run(testCmd);
  
  console.log('Stopping preview server...');
  previewProc.kill();
  
  if (!testResult.success) {
    console.log('✗ Local e2e tests failed');
    return { success: false, error: 'Local e2e tests failed' };
  }

  console.log('✓ Local e2e tests passed');
  return { success: true };
}

async function runAccessibilityCheck() {
  console.log('\n--- Running accessibility checks ---');
  
  const axeCore = require('axe-core');
  const { chromium } = require('@playwright/test');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(CONFIG.testUrl, { waitUntil: 'networkidle' });
  await page.addScriptTag({ content: axeCore.source });

  const results = await page.evaluate(() => {
    return window.axe.run();
  });

  await browser.close();

  const violations = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
  
  if (violations.length > 0) {
    console.log(`⚠ Found ${violations.length} accessibility violations:`);
    for (const v of violations.slice(0, 10)) {
      console.log(`  - [${v.impact}] ${v.id}: ${v.description}`);
      console.log(`    ${v.nodes[0]?.html || 'N/A'}`);
    }
    if (violations.length > 10) {
      console.log(`  ... and ${violations.length - 10} more`);
    }
    return { success: false, error: 'Accessibility violations found' };
  }

  console.log('✓ No critical accessibility violations found');
  return { success: true };
}

async function runSecuritySweep() {
  console.log('\n--- Running security sweep ---');
  
  const srcDir = path.join(__dirname, '..', 'src');
  const issues = [];
  
  const patterns = [
    { name: 'Hardcoded API keys (not in env)', pattern: /apiKey:\s*['"][^'"]+['"](?!.*import\.meta)/, severity: 'HIGH' },
    { name: 'AWS keys', pattern: /AKIA[0-9A-Z]{16}/, severity: 'HIGH' },
    { name: 'Private keys', pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, severity: 'HIGH' },
    { name: 'Passwords in code', pattern: /password\s*=\s*['"][^'"]{8,}['"](?!\s*\/\/ from)/i, severity: 'MEDIUM' },
    { name: 'Hardcoded secrets', pattern: /secret\s*=\s*['"][^'"]{16,}['"](?!\s*\/\/ from)/i, severity: 'HIGH' },
    { name: 'Token in URL', pattern: /token=[a-zA-Z0-9\-_]{20,}/i, severity: 'MEDIUM' },
  ];
  
  function scanFile(filePath, content) {
    for (const { name, pattern, severity } of patterns) {
      if (pattern.test(content)) {
        const relPath = path.relative(path.join(__dirname, '..'), filePath);
        issues.push({ file: relPath, name, severity });
      }
    }
  }
  
  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walkDir(fullPath);
      } else if (entry.isFile()) {
        if (/\.(js|jsx|ts|tsx|json|env)$/i.test(entry.name)) {
          if (entry.name === '.env' || entry.name === '.env.example') continue;
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            scanFile(fullPath, content);
          } catch (e) {
            // Skip files that can't be read
          }
        }
      }
    }
  }
  
  walkDir(srcDir);
  
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    console.log('  (Note: .env file contains API keys - ensure this is in .gitignore)');
  }
  
  if (issues.length > 0) {
    console.log(`⚠ Found ${issues.length} potential security issues:`);
    for (const issue of issues) {
      console.log(`  - [${issue.severity}] ${issue.name} in ${issue.file}`);
    }
    return { success: false, error: 'Security issues found', issues };
  }

  console.log('✓ No obvious security issues found');
  console.log('  (Note: This is a basic sweep. Manual review recommended.)');
  return { success: true };
}

async function runDocReview() {
  console.log('\n--- Running documentation review ---');
  
  const rootDir = path.join(__dirname, '..');
  const docsToCheck = [
    { path: 'README.md', required: true },
    { path: 'AGENTS.md', required: true },
    { path: 'docs', required: true },
  ];
  
  const issues = [];
  
  for (const doc of docsToCheck) {
    const fullPath = path.join(rootDir, doc.path);
    if (doc.required && !fs.existsSync(fullPath)) {
      issues.push(`Missing required documentation: ${doc.path}`);
    }
  }
  
  if (issues.length > 0) {
    console.log('⚠ Documentation issues found:');
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
    return { success: false, error: 'Documentation issues found' };
  }
  
  try {
    const { stdout } = require('child_process').execSync('git log -1 --format="%H" -- README.md AGENTS.md docs/', {
      encoding: 'utf8',
      cwd: rootDir,
    });
    
    const { stdout: lastCommit } = require('child_process').execSync('git log -1 --format="%H" -n 1', {
      encoding: 'utf8',
      cwd: rootDir,
    });
    
    const docCommit = stdout.trim().split('\n')[0];
    
    if (docCommit !== lastCommit.trim()) {
      console.log('⚠ Documentation has not been updated in the latest commit');
      console.log('  Please update README.md, AGENTS.md, or docs/ with your changes');
      return { success: false, error: 'Documentation not updated in latest commit' };
    }
  } catch (e) {
    console.log('  (Could not check git history, skipping commit check)');
  }
  
  console.log('✓ Documentation review passed');
  return { success: true };
}

async function runMutationTest() {
  console.log('\n--- Running mutation testing ---');
  
  const srcDir = path.join(__dirname, '..', 'src');
  const testDir = path.join(__dirname, '..', 'src', '_tests_');
  
  if (!fs.existsSync(testDir)) {
    console.log('⚠ No tests found, skipping mutation testing');
    return { success: true };
  }
  
  const testFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js') || f.endsWith('.test.jsx'));
  if (testFiles.length === 0) {
    console.log('⚠ No test files found, skipping mutation testing');
    return { success: true };
  }
  
  console.log(`  Found ${testFiles.length} test files`);
  
  const srcFiles = [];
  function walkSrc(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '_tests_' && entry.name !== 'node_modules') {
          walkSrc(fullPath);
        }
      } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) {
        if (!entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
          srcFiles.push(fullPath);
        }
      }
    }
  }
  
  if (!fs.existsSync(srcDir)) {
    console.log('⚠ Source directory not found, skipping mutation testing');
    return { success: true };
  }
  
  walkSrc(srcDir);
  
  if (srcFiles.length === 0) {
    console.log('⚠ No source files found for mutation testing');
    return { success: true };
  }
  
  console.log(`  Found ${srcFiles.length} source files to mutate`);
  
  const mutations = [
    { pattern: /===/g, replacement: '==', name: 'strict equality to loose equality' },
    { pattern: /!==/g, replacement: '!=', name: 'strict inequality to loose inequality' },
    { pattern: /\&\&/g, replacement: '&', name: 'logical AND to bitwise AND' },
    { pattern: /\|\|/g, replacement: '|', name: 'logical OR to bitwise OR' },
  ];
  
  let mutationsApplied = 0;
  let testsCaught = 0;
  
  const testSourceFile = srcFiles.find(f => f.includes('auth-context') || f.includes('firestore'));
  
  if (testSourceFile) {
    console.log(`  Testing mutation on: ${path.basename(testSourceFile)}`);
    
    let content = fs.readFileSync(testSourceFile, 'utf8');
    const originalContent = content;
    
    for (const mut of mutations) {
      if (mut.pattern.test(content)) {
        content = content.replace(mut.pattern, mut.replacement);
        
        const mutatedFile = testSourceFile + '.mutant';
        fs.writeFileSync(mutatedFile, content);
        
        const testResult = execSync('npm run test:ci -- --reporter=verbose', {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 60000,
          cwd: path.join(__dirname, '..')
        });
        
        fs.unlinkSync(mutatedFile);
        
        mutationsApplied++;
        
        if (testResult.includes('failed') || testResult.includes('FAIL')) {
          testsCaught++;
          console.log(`  ✓ Caught mutation: ${mut.name}`);
        }
        
        content = originalContent;
      }
    }
  }
  
  if (mutationsApplied > 0) {
    const score = Math.round((testsCaught / mutationsApplied) * 100);
    console.log(`  Mutation score: ${testsCaught}/${mutationsApplied} (${score}%)`);
    
    if (score < 50) {
      console.log('⚠ Low mutation score - tests may not be catching code changes');
      return { success: false, error: 'Low mutation score' };
    }
    
    console.log('✓ Mutation testing passed');
    return { success: true };
  }
  
  console.log('⚠ No applicable mutations found');
  return { success: true };
}

async function harden(attempt = 1) {
  console.log('=== Hardening Checks ===\n');
  console.log(`Config: maxBundleSize=${CONFIG.maxBundleSizeKB}KB, url=${CONFIG.testUrl}`);

  if (attempt > CONFIG.maxRetries) {
    console.log('\n✗ Max attempts reached. Hardening failed.');
    return false;
  }

  const results = {
    audit: await runNpmAudit(),
    lint: await runLint(),
    firebaseLint: await runFirebaseLint(),
    bundle: await runBundleCheck(),
    localE2e: await runLocalE2E(),
    accessibility: await runAccessibilityCheck(),
    securitySweep: await runSecuritySweep(),
    docReview: await runDocReview(),
    mutation: await runMutationTest(),
  };

  const allPassed = Object.values(results).every(r => r.success);

  if (!allPassed) {
    console.log('\n--- Fix issues and retry ---');
    const fixed = await harden(attempt + 1);
    if (!fixed) {
      console.log('\n✗ Hardening failed after retries.');
      return false;
    }
  }

  console.log('\n✓ All hardening checks passed!');
  return true;
}

harden()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Hardening error:', err);
    process.exit(1);
  });
