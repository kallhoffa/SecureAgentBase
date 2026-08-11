import { describe, it, expect } from 'vitest';
import { validate } from '../guardrails/validate';
import { SCHEMAS, parseServiceAccountJson } from '../framework/infra-setup/schemas';

const projectIdSchema = { projectId: SCHEMAS.projectId };
const githubPatSchema = { githubPat: SCHEMAS.githubPat };
const discordBotTokenSchema = { discordBotToken: SCHEMAS.discordBotToken };
const discordClientIdSchema = { discordClientId: SCHEMAS.discordClientId };
const vmMachineTypeSchema = { vmMachineType: SCHEMAS.vmMachineType };

describe('SCHEMAS.projectId', () => {
  it('accepts a valid GCP project ID', () => {
    expect(validate({ projectId: 'agentbase-staging' }, projectIdSchema)).toBeNull();
  });

  it('rejects empty/missing project ID', () => {
    expect(validate({ projectId: '' }, projectIdSchema)).toEqual({ projectId: 'Project ID is required' });
  });

  it('rejects project IDs starting with a digit', () => {
    expect(validate({ projectId: '1agentbase' }, projectIdSchema)).not.toBeNull();
  });

  it('rejects project IDs with underscores or uppercase', () => {
    expect(validate({ projectId: 'My_Project' }, projectIdSchema)).not.toBeNull();
  });

  it('rejects project IDs shorter than 6 characters', () => {
    expect(validate({ projectId: 'ab-1' }, projectIdSchema)).not.toBeNull();
  });
});

describe('SCHEMAS.githubPat', () => {
  it('accepts a classic PAT', () => {
    expect(validate({ githubPat: 'ghp_' + 'a'.repeat(36) }, githubPatSchema)).toBeNull();
  });

  it('accepts a fine-grained PAT', () => {
    expect(validate({ githubPat: 'github_pat_' + 'a'.repeat(80) }, githubPatSchema)).toBeNull();
  });

  it('rejects non-PAT strings', () => {
    expect(validate({ githubPat: 'not-a-token' }, githubPatSchema)).not.toBeNull();
  });
});

describe('SCHEMAS.discordBotToken', () => {
  it('accepts a realistic bot token', () => {
    const token = `${'A'.repeat(24)}.${'B'.repeat(6)}.${'C'.repeat(27)}`;
    expect(validate({ discordBotToken: token }, discordBotTokenSchema)).toBeNull();
  });

  it('rejects tokens with spaces or symbols', () => {
    expect(validate({ discordBotToken: 'bad token!!' }, discordBotTokenSchema)).not.toBeNull();
  });

  it('rejects empty tokens', () => {
    expect(validate({ discordBotToken: '' }, discordBotTokenSchema)).toEqual({ discordBotToken: 'Discord bot token is required' });
  });
});

describe('SCHEMAS.discordClientId', () => {
  it('accepts a numeric snowflake ID', () => {
    expect(validate({ discordClientId: '123456789012345678' }, discordClientIdSchema)).toBeNull();
  });

  it('rejects non-numeric client IDs', () => {
    expect(validate({ discordClientId: 'not-a-number' }, discordClientIdSchema)).not.toBeNull();
  });
});

describe('SCHEMAS.vmMachineType', () => {
  it('accepts valid machine types', () => {
    expect(validate({ vmMachineType: 'e2-medium' }, vmMachineTypeSchema)).toBeNull();
    expect(validate({ vmMachineType: 'n2-standard-8' }, vmMachineTypeSchema)).toBeNull();
  });

  it('rejects machine types with uppercase or spaces', () => {
    expect(validate({ vmMachineType: 'E2 medium' }, vmMachineTypeSchema)).not.toBeNull();
  });
});

describe('parseServiceAccountJson', () => {
  const validKey = JSON.stringify({
    type: 'service_account',
    project_id: 'agentbase-staging',
    private_key_id: 'abc123',
    private_key: '-----BEGIN PRIVATE KEY-----\nMII\n-----END PRIVATE KEY-----\n',
    client_email: 'sa@agentbase-staging.iam.gserviceaccount.com',
    client_id: '123456789',
  });

  it('parses a valid service account key', () => {
    const result = parseServiceAccountJson(validKey);
    expect(result.error).toBeUndefined();
    expect(result.parsed.project_id).toBe('agentbase-staging');
    expect(result.parsed.client_email).toBe('sa@agentbase-staging.iam.gserviceaccount.com');
  });

  it('rejects non-JSON input', () => {
    const result = parseServiceAccountJson('<html>404 page</html>');
    expect(result.error).toBe('Service account key is not valid JSON');
  });

  it('rejects JSON missing client_email', () => {
    const result = parseServiceAccountJson(JSON.stringify({ project_id: 'x', private_key: 'y' }));
    expect(result.error).toBe('Service account key is missing client_email');
  });

  it('rejects JSON missing private_key', () => {
    const result = parseServiceAccountJson(JSON.stringify({ project_id: 'x', client_email: 'a@b.c' }));
    expect(result.error).toBe('Service account key is missing private_key');
  });

  it('rejects empty input', () => {
    expect(parseServiceAccountJson('').error).toBe('Service account JSON is required');
    expect(parseServiceAccountJson(undefined).error).toBe('Service account JSON is required');
  });
});
