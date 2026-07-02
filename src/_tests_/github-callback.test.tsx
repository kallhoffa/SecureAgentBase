import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GitHubCallback from '../github-callback';

const mockNavigate = vi.fn();
const mockGetDoc = vi.fn();
const mockUpdateDoc = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'infra-ref'),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  Firestore: vi.fn(),
}));

const renderCallback = (search = '') =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/github-callback', search }]}>
      <GitHubCallback db={{} as never} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  mockNavigate.mockClear();

  import.meta.env.VITE_GITHUB_APP_CLIENT_ID = 'test-client-id';
  import.meta.env.VITE_GITHUB_APP_CLIENT_SECRET = 'test-client-secret';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete import.meta.env.VITE_GITHUB_APP_CLIENT_ID;
  delete import.meta.env.VITE_GITHUB_APP_CLIENT_SECRET;
});

describe('GitHubCallback', () => {
  it('shows processing state initially', () => {
    renderCallback('?code=abc&state=uid1');
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('shows cancelled state on setup_action=cancel', async () => {
    renderCallback('?setup_action=cancel&state=uid1');
    await waitFor(() => {
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
      expect(screen.getByText('GitHub App installation was cancelled')).toBeInTheDocument();
    });
  });

  it('shows error when no valid callback params', async () => {
    renderCallback('');
    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });

  it('handles OAuth fork flow successfully', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ html_url: 'https://github.com/user/repo', full_name: 'user/repo' }), { status: 202, headers: { 'Content-Type': 'application/json' } }));
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({}) });
    mockUpdateDoc.mockResolvedValue(undefined);

    renderCallback('?code=testcode&state=uid1');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByText('Success!')).toBeInTheDocument();
      expect(screen.getByText('Successfully forked SecureAgentBase!')).toBeInTheDocument();
    });
  });

  it('handles fork already exists', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Repository fork already exists' }), { status: 422, headers: { 'Content-Type': 'application/json' } }));
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });
    mockUpdateDoc.mockResolvedValue(undefined);

    renderCallback('?code=testcode&state=uid1');

    await waitFor(() => {
      expect(screen.getByText('Success!')).toBeInTheDocument();
    });
  });

  it('handles OAuth error from GitHub', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'bad_verification_code', error_description: 'The code passed is incorrect' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    renderCallback('?code=badcode&state=uid1');

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('The code passed is incorrect')).toBeInTheDocument();
    });
  });

  it('handles missing OAuth env vars', async () => {
    delete import.meta.env.VITE_GITHUB_APP_CLIENT_ID;
    delete import.meta.env.VITE_GITHUB_APP_CLIENT_SECRET;

    renderCallback('?code=test&state=uid1');

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('GitHub OAuth not configured')).toBeInTheDocument();
    });
  });

  it('shows error for anonymous state in OAuth flow', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ html_url: 'https://github.com/u/r' }), { status: 202, headers: { 'Content-Type': 'application/json' } }));

    renderCallback('?code=test&state=anonymous');

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Invalid user state')).toBeInTheDocument();
    });
  });

  it('handles GitHub App install flow', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({}) });
    mockUpdateDoc.mockResolvedValue(undefined);

    renderCallback('?installation_id=inst123&state=uid1');

    await waitFor(() => {
      expect(screen.getByText('Success!')).toBeInTheDocument();
      expect(screen.getByText('GitHub App installed successfully!')).toBeInTheDocument();
    });

    expect(mockUpdateDoc).toHaveBeenCalledWith('infra-ref', {
      github_app_installed: true,
      github_installation_id: 'inst123',
      github_installed_at: expect.any(String),
    });
  });

  it('shows error on GitHub App install when infra config missing', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });

    renderCallback('?installation_id=inst123&state=uid1');

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('No infrastructure configuration found. Please set up your project first.')).toBeInTheDocument();
    });
  });

  it('navigates to infra-setup from success state', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ html_url: 'https://github.com/u/r' }), { status: 202, headers: { 'Content-Type': 'application/json' } }));
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({}) });
    mockUpdateDoc.mockResolvedValue(undefined);

    renderCallback('?code=testcode&state=uid1');

    await act(async () => {});
    expect(screen.getByText('Success!')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(3000); });
    expect(mockNavigate).toHaveBeenCalledWith('/infra-setup');
  });

  it('navigates to infra-setup from error state', async () => {
    renderCallback('?setup_action=cancel&state=uid1');

    await waitFor(() => {
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Try Again'));
    expect(mockNavigate).toHaveBeenCalledWith('/infra-setup');
  });
});
