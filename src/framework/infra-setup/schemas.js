/**
 * Guardrail schemas for the infra-setup wizard.
 *
 * Deep module: one interface (SCHEMAS + parseServiceAccountJson), the validation
 * rules for every wizard input live here so callers never re-invent formats.
 * Every user-input write in the wizard must pass `validate(data, SCHEMAS.x)`
 * before any network/Firestore call.
 */

export const SCHEMAS = {
  projectId: {
    type: 'string',
    required: true,
    minLength: 6,
    maxLength: 30,
    pattern: /^[a-z][a-z0-9-]{5,29}$/,
    message: 'Project ID must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens (6-30 characters)',
    label: 'Project ID',
  },
  githubPat: {
    type: 'string',
    required: true,
    minLength: 20,
    maxLength: 200,
    pattern: /^(ghp_|github_pat_)/,
    message: 'GitHub PAT must start with ghp_ or github_pat_',
    label: 'GitHub PAT',
  },
  discordBotToken: {
    type: 'string',
    required: true,
    minLength: 24,
    maxLength: 200,
    pattern: /^[A-Za-z0-9_.-]+$/,
    message: 'Discord bot token has an invalid format',
    label: 'Discord bot token',
  },
  discordClientId: {
    type: 'string',
    required: true,
    minLength: 15,
    maxLength: 20,
    pattern: /^\d+$/,
    message: 'Discord client ID must be a numeric snowflake ID',
    label: 'Discord client ID',
  },
  vmMachineType: {
    type: 'string',
    required: true,
    minLength: 2,
    maxLength: 50,
    pattern: /^[a-z0-9-]+$/,
    label: 'VM machine type',
  },
};

/**
 * Validates a raw service-account key (as pasted or uploaded) and returns the
 * parsed object, or an error message. Use before storing the key or using it
 * for token exchange.
 */
export const parseServiceAccountJson = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { error: 'Service account JSON is required' };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'Service account key is not valid JSON' };
  }
  if (!parsed.client_email || typeof parsed.client_email !== 'string') {
    return { error: 'Service account key is missing client_email' };
  }
  if (!parsed.private_key || typeof parsed.private_key !== 'string') {
    return { error: 'Service account key is missing private_key' };
  }
  if (!parsed.project_id || typeof parsed.project_id !== 'string') {
    return { error: 'Service account key is missing project_id' };
  }
  return { parsed };
};
