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
  
  const firebaseConfig = JSON.parse(execSync('firebase projects:list --json', { encoding: 'utf8' }));
  const projects = firebaseConfig.result || [];
  const argbase = projects.find(p => p.name?.includes('argbase'));
  if (argbase) return argbase.projectId;
  
  console.log('No --prod or --staging flag, defaulting to staging');
  return 'argbase-staging';
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

async function main() {
  console.log('\n--- Firebase Remote Config Setter ---\n');
  
  const projectId = getProjectId();
  console.log(`Project: ${projectId}`);
  
  if (!fs.existsSync(RC_CONFIG_PATH)) {
    console.error(`Error: ${RC_CONFIG_PATH} not found`);
    process.exit(1);
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
  
  console.log('Pushing Remote Config...');
  console.log(`Parameters: ${Object.keys(template.parameters).join(', ')}`);
  console.log(`Conditions: ${template.conditions.map(c => c.name).join(', ')}`);
  
  const result = await setRemoteConfig(projectId, template);
  
  console.log('\n✓ Remote Config published successfully!');
  console.log(`Version: ${result.versionNumber}`);
  
  const paramSummary = Object.entries(config.parameters).map(([key, param]) => {
    let summary = `  ${key}: ${param.defaultValue?.value || 'N/A'}`;
    const conditional = config.conditionalValues?.[key];
    if (conditional) {
      const conditions = Object.entries(conditional).map(([cond, val]) => `${cond}=${val.value}`).join(', ');
      summary += `\n    Conditions: ${conditions}`;
    }
    return summary;
  }).join('\n');
  
  console.log('\nSummary:');
  console.log(paramSummary);
}

main().catch(err => {
  console.error('\n✗ Error:', err.message);
  process.exit(1);
});
