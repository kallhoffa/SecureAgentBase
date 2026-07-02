import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CreateApp from '../create-app';

const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();

vi.mock('../firestore-utils/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'doc-ref'),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  Firestore: vi.fn(),
}));

const renderCreateApp = () =>
  render(
    <MemoryRouter>
      <CreateApp db={{} as never} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { uid: 'u1', email: 'test@example.com' }, loading: false });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ github_app_installed: true, service_account_configured: true, gcp_project_id: 'proj-1' }) });
});

describe('CreateApp', () => {
  it('shows loading spinner when auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    renderCreateApp();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows loading spinner while loading infra config', () => {
    mockGetDoc.mockReturnValue(new Promise(() => {}));
    renderCreateApp();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders step 1 (app details) by default', async () => {
    renderCreateApp();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'App Details' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('my-awesome-app')).toBeInTheDocument();
    });
  });

  it('validates app name (too short)', async () => {
    renderCreateApp();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('my-awesome-app')).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText('my-awesome-app');
    fireEvent.change(input, { target: { value: 'ab' } });
    await waitFor(() => {
      expect(screen.getByText(/Must be 3-50 characters/)).toBeInTheDocument();
    });
  });

  it('accepts valid app name', async () => {
    renderCreateApp();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('my-awesome-app')).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText('my-awesome-app');
    fireEvent.change(input, { target: { value: 'my-valid-app' } });
    expect(screen.queryByText(/Must be 3-50 characters/)).not.toBeInTheDocument();
  });

  it('disables continue on step 1 without valid app name', async () => {
    renderCreateApp();
    await waitFor(() => {
      expect(screen.getByText('Continue')).toBeInTheDocument();
    });
    const continueBtn = screen.getByText('Continue');
    expect(continueBtn).toBeDisabled();
  });

  it('enables continue on step 1 with valid app name', async () => {
    renderCreateApp();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('my-awesome-app')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('my-awesome-app'), { target: { value: 'my-app' } });
    const continueBtn = screen.getByText('Continue');
    expect(continueBtn).not.toBeDisabled();
  });

  it('navigates to step 2 on continue', async () => {
    renderCreateApp();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('my-awesome-app')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('my-awesome-app'), { target: { value: 'my-app' } });
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'GitHub Setup' })).toBeInTheDocument();
    });
  });

  it('shows GitHub connected state on step 2', async () => {
    renderCreateApp();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('my-awesome-app')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('my-awesome-app'), { target: { value: 'my-app' } });
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByText('GitHub App installed')).toBeInTheDocument();
    });
  });

  it('shows GitHub disconnected state on step 2', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ github_app_installed: false }) });
    renderCreateApp();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('my-awesome-app')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('my-awesome-app'), { target: { value: 'my-app' } });
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByText(/connect your github account/i)).toBeInTheDocument();
    });
  });

  it('navigates back from step 2 to step 1', async () => {
    renderCreateApp();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('my-awesome-app')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('my-awesome-app'), { target: { value: 'my-app' } });
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'GitHub Setup' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Back'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'App Details' })).toBeInTheDocument();
    });
  });

  it('shows GCP connected state on step 3', async () => {
    renderCreateApp();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('my-awesome-app')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('my-awesome-app'), { target: { value: 'my-app' } });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByText('Cloud Provisioning')).toBeInTheDocument();
      expect(screen.getByText(/GCP configured: proj-1/)).toBeInTheDocument();
    });
  });

  it('shows GCP disconnected state on step 3', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ github_app_installed: true, service_account_configured: false }) });
    renderCreateApp();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('my-awesome-app')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('my-awesome-app'), { target: { value: 'my-app' } });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByText(/configure your gcp project first/i)).toBeInTheDocument();
    });
  });

  it('shows discord config on step 4', async () => {
    renderCreateApp();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('my-awesome-app')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('my-awesome-app'), { target: { value: 'my-app' } });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByText('Discord Configuration')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/discord.com\/api\/webhooks/)).toBeInTheDocument();
    });
  });

  it('shows success screen after full app creation', async () => {
    vi.stubGlobal('fetch', vi.fn());
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ github_app_installed: true, service_account_configured: true, gcp_project_id: 'proj-1', gcp_access_token: 'tok' }) });
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ full_name: 'u1/my-app', html_url: 'https://github.com/u1/my-app' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ networkInterfaces: [{ accessConfigs: [{ natIP: '1.2.3.4' }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);

    renderCreateApp();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('my-awesome-app')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('my-awesome-app'), { target: { value: 'my-app' } });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByText('Discord Configuration')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Create App'));
    await waitFor(() => {
      expect(screen.getByText('App Created!')).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  it('shows error on create app failure', async () => {
    vi.stubGlobal('fetch', vi.fn());
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ github_app_installed: true, service_account_configured: true, gcp_project_id: 'proj-1', gcp_access_token: 'tok' }) });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValue(new Error('API error'));

    renderCreateApp();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('my-awesome-app')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('my-awesome-app'), { target: { value: 'my-app' } });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByText('Discord Configuration')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Create App'));
    await waitFor(() => {
      expect(screen.getByText('API error')).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  it('navigates back to profile from create app page', async () => {
    renderCreateApp();
    await waitFor(() => {
      expect(screen.getByText('Create New App')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Back to Profile'));
    expect(mockNavigate).toHaveBeenCalledWith('/profile');
  });

  it('renders steps indicator bar', async () => {
    renderCreateApp();
    await waitFor(() => {
      expect(screen.getAllByText('App Details').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('GitHub Setup')).toBeInTheDocument();
      expect(screen.getByText('Cloud Provision')).toBeInTheDocument();
      expect(screen.getByText('Discord Config')).toBeInTheDocument();
    });
  });
});
