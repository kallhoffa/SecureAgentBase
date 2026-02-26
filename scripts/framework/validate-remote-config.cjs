const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RC_CONFIG_PATH = path.join(__dirname, 'remote-config.json');

function getProjectId() {
  const args = process.argv.slice(2);
  const prodIndex = args.indexOf('--prod');
  const stagingIndex = args.indexOf('--staging');
  
  if (prodIndex !== -1) return 'argbase-prod';
  if (stagingIndex !== -1) return 'argbase-staging';
  
  return 'argbase-staging';
}

async function getAccessToken() {
  if (process.env.FIREBASE_TOKEN) {
    return process.env.FIREBASE_TOKEN;
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

function validate(localConfig, remoteConfig) {
  const errors = [];
  const warnings = [];
  
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
        errors.push(`Parameter "${paramKey}" condition "${conditionName}" has wrong value: expected "${localConditionals[conditionName].value}", got "${remoteConditionals[conditionName].value}"`);
      }
    }
  }
  
  for (const paramKey of Object.keys(remoteParams)) {
    if (!localParams[paramKey]) {
      warnings.push(`Remote Config has extra parameter "${paramKey}" not in local config`);
    }
  }
  
  for (const localCond of localConditions) {
    const remoteCond = remoteConditions.find(c => c.name === localCond.name);
    if (!remoteCond) {
      errors.push(`Condition "${localCond.name}" is missing in Remote Config`);
    } else if (localCond.expression !== remoteCond.expression) {
      errors.push(`Condition "${localCond.name}" has different expression`);
    }
  }
  
  return { errors, warnings };
}

async function main() {
  console.log('\n--- Firebase Remote Config Validator ---\n');
  
  const projectId = getProjectId();
  console.log(`Project: ${projectId}`);
  
  if (!fs.existsSync(RC_CONFIG_PATH)) {
    console.error(`Error: ${RC_CONFIG_PATH} not found`);
    process.exit(1);
  }
  
  const localConfig = JSON.parse(fs.readFileSync(RC_CONFIG_PATH, 'utf8'));
  
  console.log('Fetching Remote Config from Firebase...');
  const remoteConfig = await getRemoteConfig(projectId);
  
  console.log('Validating...\n');
  
  const { errors, warnings } = validate(localConfig, remoteConfig);
  
  if (warnings.length > 0) {
    console.log('Warnings:');
    warnings.forEach(w => console.log(`  ⚠ ${w}`));
    console.log('');
  }
  
  if (errors.length > 0) {
    console.log('Errors:');
    errors.forEach(e => console.log(`  ✗ ${e}`));
    console.log('\n✗ Validation FAILED!');
    console.log('\nTo fix, run:');
    console.log(`  node scripts/set-remote-config.js --${projectId.includes('prod') ? 'prod' : 'staging'}`);
    process.exit(1);
  }
  
  console.log('✓ Validation PASSED!');
  console.log(`\nParameters validated: ${Object.keys(localConfig.parameters).length}`);
  console.log(`Conditions validated: ${localConfig.conditions?.length || 0}`);
}

main().catch(err => {
  console.error('\n✗ Error:', err.message);
  process.exit(1);
});
