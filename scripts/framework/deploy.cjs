const { execSync, exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');

const execPromise = util.promisify(exec);

const RC_CONFIG_PATH = path.join(__dirname, 'remote-config.json');
const MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 30000;

const args = process.argv.slice(2);
const isProduction = args.includes('--prod');
const targetUrl = isProduction ? 'https://argbase.org' : 'https://argbase-staging.web.app';
const workflowName = isProduction ? 'firebase-deploy.yml' : 'firebase-deploy-staging.yml';

async function checkGhInstalled() {
  try {
    execSync('gh --version', { stdio: 'pipe' });
    return true;
  } catch (e) {
    return false;
  }
}

async function run(cmd, options = {}) {
  try {
    const stdout = execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...options });
    return { stdout, error: null };
  } catch (e) {
    return { stdout: e.stdout, stderr: e.stderr, error: e };
  }
}

async function getAccessToken() {
  if (process.env.FIREBASE_TOKEN) {
    try {
      const token = execSync('firebase auth:print-access-token', { encoding: 'utf8' });
      return token.trim();
    } catch (e) {
      return process.env.FIREBASE_TOKEN;
    }
  }
  
  try {
    const token = execSync('firebase auth:print-access-token', { encoding: 'utf8' });
    return token.trim();
  } catch (e) {
    throw new Error('Failed to get Firebase access token. Run "firebase login" or set FIREBASE_TOKEN env var.');
  }
}

async function getRemoteConfig(projectId) {
  const token = await getAccessToken();
  const url = `https://firebaseremoteconfig.googleapis.com/v1/projects/${projectId}/remoteConfig`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Remote Config: ${error}`);
  }
  
  return response.json();
}

async function setRemoteConfig(projectId, config) {
  const token = await getAccessToken();
  const url = `https://firebaseremoteconfig.googleapis.com/v1/projects/${projectId}/remoteConfig`;
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(config)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to set Remote Config: ${error}`);
  }
  
  return response.json();
}

async function validateRemoteConfig(projectId) {
  if (!fs.existsSync(RC_CONFIG_PATH)) {
    throw new Error(`${RC_CONFIG_PATH} not found. Run "npm run remote-config:init" first.`);
  }
  
  const localConfig = JSON.parse(fs.readFileSync(RC_CONFIG_PATH, 'utf8'));
  const remoteConfig = await getRemoteConfig(projectId);
  
  const errors = [];
  const localParams = localConfig.parameters || {};
  const remoteParams = remoteConfig.parameters || {};
  const localConditions = localConfig.conditions || [];
  const remoteConditions = remoteConfig.conditions || [];
  const localConditionalValues = localConfig.conditionalValues || {};
  
  for (const [paramKey, paramConfig] of Object.entries(localParams)) {
    if (!remoteParams[paramKey]) {
      errors.push(`Parameter "${paramKey}" is missing in Remote Config`);
      continue;
    }
    
    const remoteParam = remoteParams[paramKey];
    const localDefault = paramConfig.defaultValue?.value;
    const remoteDefault = remoteParam.defaultValue?.value;
    
    if (localDefault !== remoteDefault) {
      errors.push(`Parameter "${paramKey}" has wrong default: expected "${localDefault}", got "${remoteDefault}"`);
    }
    
    const localConditionals = localConditionalValues[paramKey] || {};
    const remoteConditionals = remoteParam.conditionalValues || {};
    
    for (const conditionName of Object.keys(localConditionals)) {
      if (!remoteConditionals[conditionName]) {
        errors.push(`Parameter "${paramKey}" is missing condition "${conditionName}"`);
      } else if (localConditionals[conditionName].value !== remoteConditionals[conditionName].value) {
        errors.push(`Parameter "${paramKey}" condition "${conditionName}" has wrong value`);
      }
    }
  }
  
  for (const localCond of localConditions) {
    const remoteCond = remoteConditions.find(c => c.name === localCond.name);
    if (!remoteCond) {
      errors.push(`Condition "${localCond.name}" is missing in Remote Config`);
    }
  }
  
  return errors;
}

async function syncRemoteConfig(projectId) {
  console.log('\n--- Syncing Remote Config ---');
  
  if (!fs.existsSync(RC_CONFIG_PATH)) {
    throw new Error(`${RC_CONFIG_PATH} not found. Run "npm run remote-config:init" first.`);
  }
  
  const config = JSON.parse(fs.readFileSync(RC_CONFIG_PATH, 'utf8'));
  
  const template = {
    conditions: config.conditions || [],
    parameters: config.parameters || {},
  };
  
  if (config.conditionalValues) {
    for (const [paramKey, conditions] of Object.entries(config.conditionalValues)) {
      if (!template.parameters[paramKey]) {
        template.parameters[paramKey] = { defaultValue: { value: 'control' } };
      }
      template.parameters[paramKey].conditionalValues = {};
      for (const [conditionName, conditionValue] of Object.entries(conditions)) {
        template.parameters[paramKey].conditionalValues[conditionName] = conditionValue;
      }
    }
  }
  
  console.log(`Parameters: ${Object.keys(template.parameters).join(', ')}`);
  
  const result = await setRemoteConfig(projectId, template);
  console.log(`✓ Remote Config published (version ${result.versionNumber})`);
}

async function getLatestRunId(commitSha) {
  try {
    const { stdout } = await run(`gh run list --workflow=${workflowName} --limit=10 --json databaseId,headSha`);
    const data = JSON.parse(stdout);
    
    if (commitSha) {
      const run = data.find(r => r.headSha === commitSha);
      return run ? run.databaseId : null;
    }
    
    return data[0]?.databaseId || null;
  } catch (e) {
    console.error('Failed to get run ID:', e.message);
    return null;
  }
}

async function getRunStatus(runId) {
  try {
    const { stdout } = await run(`gh run view ${runId} --json status,conclusion`);
    return JSON.parse(stdout);
  } catch (e) {
    console.error('Failed to get run status:', e.message);
    return null;
  }
}

async function getRunLogs(runId) {
  try {
    const { stdout } = await run(`gh run view ${runId} --log`);
    return stdout;
  } catch (e) {
    console.error('Failed to get run logs:', e.message);
    return '';
  }
}

function parseErrors(logs) {
  const errors = [];

  const eslintPattern = /\[eslint\].*?Line \d+:\d+/gi;
  const eslintMatches = logs.match(eslintPattern);
  if (eslintMatches) {
    errors.push({ type: 'eslint', matches: eslintMatches });
  }

  const buildPattern = /Failed to compile/gi;
  const buildMatches = logs.match(buildPattern);
  if (buildMatches) {
    errors.push({ type: 'build', matches: buildMatches });
  }

  const depPattern = /Cannot find module ['"](\@?[^'"]+)['"]/gi;
  let depMatch;
  const depMatches = [];
  while ((depMatch = depPattern.exec(logs)) !== null) {
    depMatches.push(depMatch[1]);
  }
  if (depMatches.length > 0) {
    errors.push({ type: 'dependency', matches: [...new Set(depMatches)] });
  }

  return errors;
}

async function autoFix(errors) {
  let fixed = false;

  for (const error of errors) {
    if (error.type === 'eslint') {
      console.log('Running eslint --fix...');
      const result = await run('npx eslint src/ --fix');
      if (!result.error) {
        fixed = true;
        console.log('ESLint fixes applied.');
      }
    }

    if (error.type === 'dependency') {
      for (const pkg of error.matches) {
        console.log(`Installing missing package: ${pkg}`);
        const result = await run(`npm install --save-dev ${pkg}`);
        if (!result.error) {
          fixed = true;
          console.log(`Installed ${pkg}`);
        }
      }
    }
  }

  if (fixed) {
    const { stdout } = await run('git status --porcelain');
    if (stdout.trim()) {
      await run('git add -A');
      await run('git commit -m "deploy: auto-fix errors"');
      await run('git push');
      console.log('Fixes committed and pushed.');
      return true;
    }
  }

  return false;
}

async function deploy(attempt = 1) {
  console.log(`\n--- Deployment to ${isProduction ? 'Production' : 'Staging'} ---`);
  console.log(`Target: ${targetUrl}`);
  console.log(`Workflow: ${workflowName}`);
  console.log(`\n--- Deployment attempt ${attempt}/${MAX_ATTEMPTS} ---`);

  const ghInstalled = await checkGhInstalled();
  if (!ghInstalled) {
    console.error('GitHub CLI (gh) is not installed.');
    console.error('Install it from: https://cli.github.com/');
    return false;
  }

  const { stdout: currentBranch } = await run('git branch --show-current');
  const branch = currentBranch.trim();
  
  if (branch !== 'main' && branch !== 'master') {
    console.log(`\n⚠ You are on branch: ${branch}`);
    console.log('Deployments should only be made from main branch.');
    console.log('Please merge your changes to main first:');
    console.log('  git checkout main');
    console.log('  git merge ' + branch);
    console.log('  git push');
    return false;
  }

  const projectId = isProduction ? 'argbase-prod' : 'argbase-staging';

  console.log('\n--- Validating Remote Config ---');
  const validationErrors = await validateRemoteConfig(projectId);
  if (validationErrors.length > 0) {
    console.log('✗ Remote Config validation failed:');
    validationErrors.forEach(e => console.log(`  - ${e}`));
    console.log('\nSyncing Remote Config...');
    await syncRemoteConfig(projectId);
  } else {
    console.log('✓ Remote Config is valid');
  }

  if (isProduction) {
    console.log('\n⚠ Production deployment requires creating a GitHub release.');
    console.log('\nTo deploy to production:');
    console.log('  1. Push your changes to main');
    console.log('  2. Create a release:');
    console.log('     git tag v0.x.x');
    console.log('     git push --tags');
    console.log('\nOr create a release manually at:');
    console.log('  https://github.com/kallhoffa/argbase/releases/new');
    return false;
  }

  if (attempt > MAX_ATTEMPTS) {
    console.log('Max attempts reached. Deployment failed.');
    return false;
  }

  const beforeRunId = await getLatestRunId();

  const { stdout: status } = await run('git status --porcelain');
  let pushedCommitSha = null;
  if (status.trim()) {
    console.log('\n--- Unstaged changes detected ---');
    const { stdout: diff } = await run('git diff --stat');
    console.log(diff);
    console.log('Committing and pushing...');
    await run('git add -A');
    await run('git commit -m "deploy: prepare for deployment"');
    await run('git push');
    console.log('Changes pushed.');
  }

  const { stdout: currentCommit } = await run('git rev-parse HEAD');
  pushedCommitSha = currentCommit.trim();

  await new Promise(r => setTimeout(r, 5000));

  let runId = await getLatestRunId(pushedCommitSha);
  let waitCount = 0;
  while (!runId && waitCount < 12) {
    console.log(`Waiting for workflow to start for commit ${pushedCommitSha.substring(0, 7)}...`);
    await new Promise(r => setTimeout(r, 5000));
    runId = await getLatestRunId(pushedCommitSha);
    waitCount++;
  }

  if (!runId) {
    console.log('Could not get workflow run ID. Deployment failed.');
    return false;
  }

  console.log(`Polling workflow run ${runId}...`);

  let statusResult;
  while (true) {
    statusResult = await getRunStatus(runId);
    if (!statusResult) {
      console.log('Failed to get run status, retrying...');
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }
    if (statusResult.status === 'completed') break;
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.log(`Workflow completed with conclusion: ${statusResult.conclusion}`);

  if (statusResult.conclusion === 'success') {
    console.log('Deployment successful!');
    return true;
  }

  console.log(`Deployment failed. Fetching logs...`);
  const logs = await getRunLogs(runId);
  const errors = parseErrors(logs);

  if (errors.length === 0) {
    console.log('Could not parse errors from logs. Manual intervention required.');
    console.log('\n--- Last 50 lines of logs ---');
    const lines = logs.split('\n');
    console.log(lines.slice(-50).join('\n'));
    return false;
  }

  console.log('Detected error types:', errors.map(e => e.type).join(', '));

  console.log('Attempting auto-fix...');
  const fixed = await autoFix(errors);

  if (fixed) {
    console.log('Fix applied, retrying deployment...');
    return deploy(attempt + 1);
  } else {
    console.log('Could not auto-fix. Manual intervention required.');
    return false;
  }
}

deploy()
  .then(success => {
    if (success) {
      console.log('\n✓ Deployment completed successfully!');
    } else {
      console.log('\n✗ Deployment failed after maximum attempts.');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Deployment error:', err);
    process.exit(1);
  });
