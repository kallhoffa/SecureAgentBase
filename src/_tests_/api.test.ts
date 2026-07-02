import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  gcpApiFetch,
  githubApiFetch,
  setGitHubVariable,
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