import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  gcpApiFetch,
  githubApiFetch,
  setGitHubVariable,
  smEnsureSecret,
  smAddVersion,
  smSetSecretAccess,
  smWriteSecret,
} from '../framework/infra-setup/api';

const ok = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );

const empty = (status: number) =>
  Promise.resolve(new Response(null, { status }));

describe('gcpApiFetch', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('sends Bearer token + JSON content-type header', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(ok(200, { ok: true }));
    await gcpApiFetch('https://example.com/api', 'tok123', { method: 'POST', body: '{"a":1}' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/api');
    expect((init as any).method).toBe('POST');
    expect((init as any).headers['Authorization']).toBe('Bearer tok123');
    expect((init as any).headers['Content-Type']).toBe('application/json');
  });

  it('defaults to GET when no method provided', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(ok(200, {}));
    await gcpApiFetch('https://example.com/api', 'tok');
    expect((fetchMock.mock.calls[0][1] as any).method).toBe('GET');
  });

  it('does not overwrite caller headers with default ones', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(ok(200, {}));
    await gcpApiFetch('https://example.com/api', 'tok', {
      headers: { 'Content-Type': 'text/plain', 'X-Custom': 'yes' },
    });
    const headers = (fetchMock.mock.calls[0][1] as any).headers;
    expect(headers['Content-Type']).toBe('text/plain');
    expect(headers['X-Custom']).toBe('yes');
    expect(headers['Authorization']).toBe('Bearer tok');
  });

  it('returns parsed JSON on 200', async () => {
    vi.mocked(fetch).mockResolvedValue(ok(200, { hello: 'world' }));
    const result = await gcpApiFetch('https://example.com', 'tok');
    expect(result).toEqual({ hello: 'world' });
  });

  it('returns {} on 204 (no body to parse)', async () => {
    vi.mocked(fetch).mockResolvedValue(empty(204) as any);
    const result = await gcpApiFetch('https://example.com', 'tok', { method: 'DELETE' });
    expect(result).toEqual({});
  });

  it('returns {} on empty 200 body', async () => {
    vi.mocked(fetch).mockResolvedValue(ok(200, ''));
    const result = await gcpApiFetch('https://example.com', 'tok');
    expect(result).toEqual({});
  });

  it('throws with status + text on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Promise.resolve(new Response('{"error":"denied"}', { status: 403 }))
    );
    await expect(gcpApiFetch('https://example.com', 'tok')).rejects.toThrow(
      /GCP API error \(403\).*denied/
    );
  });

  it('falls back to statusText when body cannot be read', async () => {
    const resp = { ok: false, status: 500, statusText: 'Internal Error', text: () => Promise.reject(new Error('boom')) } as any;
    vi.mocked(fetch).mockResolvedValue(resp);
    await expect(gcpApiFetch('https://example.com', 'tok')).rejects.toThrow(
      /GCP API error \(500\).*Internal Error/
    );
  });

  it('does not call response.text() on 204 (avoids body-disturbed)', async () => {
    const textSpy = vi.fn();
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 204, text: textSpy } as any);
    await gcpApiFetch('https://example.com', 'tok');
    expect(textSpy).not.toHaveBeenCalled();
  });
});

describe('githubApiFetch', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('prepends https://api.github.com to the path', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(ok(200, {}));
    await githubApiFetch('pat', '/user');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/user');
  });

  it('sends Bearer PAT + GitHub accept headers', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(ok(200, {}));
    await githubApiFetch('pat-123', '/repos');
    const headers = (fetchMock.mock.calls[0][1] as any).headers;
    expect(headers['Authorization']).toBe('Bearer pat-123');
    expect(headers['Accept']).toBe('application/vnd.github.v3+json');
  });

  it('returns {} on 204 (update existing variable/releases)', async () => {
    vi.mocked(fetch).mockResolvedValue(empty(204) as any);
    const result = await githubApiFetch('pat', '/repos/o/r/actions/variables/X', {
      method: 'PATCH', body: '{"name":"X","value":"v"}',
    });
    expect(result).toEqual({});
  });

  it('throws with GitHub API error prefix on non-ok', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Promise.resolve(new Response('{"message":"Not Found"}', { status: 404 }))
    );
    await expect(githubApiFetch('pat', '/repos/o/r/missing')).rejects.toThrow(
      /GitHub API error \(404\).*Not Found/
    );
  });
});

describe('setGitHubVariable', () => {
  const pat = 'pat';
  const repoFull = 'kallhoffa/SecureAgentBase';

  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('POSTs to /actions/variables when variable is new (201 Created)', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(ok(201, {}));
    await setGitHubVariable(pat, repoFull, 'NEW_VAR', 'value-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/kallhoffa/SecureAgentBase/actions/variables');
    expect((init as any).method).toBe('POST');
    expect(JSON.parse((init as any).body)).toEqual({ name: 'NEW_VAR', value: 'value-1' });
  });

  it('falls back to PATCH when POST returns 422 (already exists)', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(Promise.resolve(new Response('{"message":"already exists"}', { status: 422 })))
      .mockResolvedValueOnce(empty(204) as any);

    await setGitHubVariable(pat, repoFull, 'EXISTING_VAR', 'value-2');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url1, init1] = fetchMock.mock.calls[0];
    expect((init1 as any).method).toBe('POST');
    const [url2, init2] = fetchMock.mock.calls[1];
    expect(url2).toBe('https://api.github.com/repos/kallhoffa/SecureAgentBase/actions/variables/EXISTING_VAR');
    expect((init2 as any).method).toBe('PATCH');
    expect(JSON.parse((init2 as any).body)).toEqual({ name: 'EXISTING_VAR', value: 'value-2' });
  });

  it('skips entirely when value is empty (early return)', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(ok(201, {}));
    await setGitHubVariable(pat, repoFull, 'EMPTY', '');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when value is undefined', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(ok(201, {}));
    await setGitHubVariable(pat, repoFull, 'UNDEF', undefined as any);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('smEnsureSecret', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('creates the secret with automatic replication when new', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(ok(200, { name: 'projects/p-1/secrets/github-pat' }));
    const name = await smEnsureSecret('tok', 'p-1', 'github-pat');

    expect(name).toBe('projects/p-1/secrets/github-pat');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://secretmanager.googleapis.com/v1/projects/p-1/secrets?secretId=github-pat');
    expect((init as any).method).toBe('POST');
    expect(JSON.parse((init as any).body)).toEqual({ replication: { automatic: {} } });
  });

  it('fetches the existing secret on 409 already-exists', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(Promise.resolve(new Response('{"error":{"message":"already exists"}}', { status: 409 })))
      .mockResolvedValueOnce(ok(200, { name: 'projects/p-1/secrets/github-pat' }));

    const name = await smEnsureSecret('tok', 'p-1', 'github-pat');

    expect(name).toBe('projects/p-1/secrets/github-pat');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://secretmanager.googleapis.com/v1/projects/p-1/secrets/github-pat');
    expect((init as any).method).toBe('GET');
  });

  it('propagates non-409 errors', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Promise.resolve(new Response('{"error":{"message":"permission denied"}}', { status: 403 }))
    );
    await expect(smEnsureSecret('tok', 'p-1', 'github-pat')).rejects.toThrow(
      /GCP API error \(403\)/
    );
  });

  it('retries on SERVICE_DISABLED until the API activates', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        Promise.resolve(new Response('{"error":{"reason":"SERVICE_DISABLED"}}', { status: 403 }))
      )
      .mockResolvedValueOnce(ok(200, { name: 'projects/p-1/secrets/github-pat' }));

    const name = await smEnsureSecret('tok', 'p-1', 'github-pat');

    expect(name).toBe('projects/p-1/secrets/github-pat');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 15000);
});

describe('smAddVersion', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('POSTs the value base64-encoded as a new version', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(ok(200, { name: 'projects/p-1/secrets/github-pat/versions/3' }));
    const name = await smAddVersion('tok', 'p-1', 'github-pat', 'ghp_abc123');

    expect(name).toBe('projects/p-1/secrets/github-pat/versions/3');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://secretmanager.googleapis.com/v1/projects/p-1/secrets/github-pat:addVersion');
    expect((init as any).method).toBe('POST');
    const body = JSON.parse((init as any).body);
    expect(body.payload.data).toBe(btoa('ghp_abc123'));
  });

  it('encodes non-ASCII values safely (no btoa latin1 blowup)', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(ok(200, { name: 'projects/p-1/secrets/discord-bot-token/versions/1' }));
    await smAddVersion('tok', 'p-1', 'discord-bot-token', 'MTAköztié×1');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.payload.data).toBe(btoa(String.fromCharCode(...new TextEncoder().encode('MTAköztié×1'))));
  });
});

describe('smSetSecretAccess', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('merges accessor members into the existing policy and keeps the etag', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(ok(200, {
        etag: 'ETAG1',
        bindings: [{ role: 'roles/secretmanager.secretAccessor', members: ['serviceAccount:sa@x.iam.gserviceaccount.com'] }],
      }))
      .mockResolvedValueOnce(ok(200, {}));

    await smSetSecretAccess('tok', 'p-1', 'github-pat', ['user:ops@example.com', 'serviceAccount:sa@x.iam.gserviceaccount.com']);

    const [getUrl, getInit] = fetchMock.mock.calls[0];
    expect(getUrl).toBe('https://secretmanager.googleapis.com/v1/projects/p-1/secrets/github-pat:getIamPolicy');
    expect((getInit as any).method).toBe('GET');

    const [setUrl, setInit] = fetchMock.mock.calls[1];
    expect(setUrl).toBe('https://secretmanager.googleapis.com/v1/projects/p-1/secrets/github-pat:setIamPolicy');
    const body = JSON.parse((setInit as any).body);
    expect(body.policy.etag).toBe('ETAG1');
    const accessor = body.policy.bindings.find((b) => b.role === 'roles/secretmanager.secretAccessor');
    expect(accessor.members).toEqual([
      'serviceAccount:sa@x.iam.gserviceaccount.com',
      'user:ops@example.com',
    ]);
  });

  it('creates the accessor binding when the policy has none', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(ok(200, { etag: 'ETAG2', bindings: [] }))
      .mockResolvedValueOnce(ok(200, {}));

    await smSetSecretAccess('tok', 'p-1', 'discord-bot-token', ['user:ops@example.com']);

    const body = JSON.parse((fetchMock.mock.calls[1][1] as any).body);
    expect(body.policy.bindings).toEqual([
      { role: 'roles/secretmanager.secretAccessor', members: ['user:ops@example.com'] },
    ]);
  });
});

describe('smWriteSecret', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('orchestrates ensure + addVersion + access and returns the secret name', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(ok(200, { name: 'projects/p-1/secrets/github-pat' })) // ensure POST
      .mockResolvedValueOnce(ok(200, { name: 'projects/p-1/secrets/github-pat/versions/1' })) // addVersion
      .mockResolvedValueOnce(ok(200, { etag: 'E', bindings: [] })) // getIamPolicy
      .mockResolvedValueOnce(ok(200, {})); // setIamPolicy

    const log = vi.fn();
    const name = await smWriteSecret('tok', 'p-1', 'github-pat', 'ghp_secret', ['user:ops@example.com'], log);

    expect(name).toBe('projects/p-1/secrets/github-pat');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('github-pat'));
  });

  it('reuses the secret name on 409 instead of double-creating', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(Promise.resolve(new Response('{"error":{"message":"already exists"}}', { status: 409 })))
      .mockResolvedValueOnce(ok(200, { name: 'projects/p-1/secrets/discord-bot-token' })) // ensure GET fallback
      .mockResolvedValueOnce(ok(200, { name: 'projects/p-1/secrets/discord-bot-token/versions/2' }))
      .mockResolvedValueOnce(ok(200, { etag: 'E', bindings: [] }))
      .mockResolvedValueOnce(ok(200, {}));

    const name = await smWriteSecret('tok', 'p-1', 'discord-bot-token', 'tok2', ['serviceAccount:sa@x.iam.gserviceaccount.com']);

    expect(name).toBe('projects/p-1/secrets/discord-bot-token');
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});