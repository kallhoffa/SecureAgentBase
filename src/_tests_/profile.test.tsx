import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Profile from '../profile';

const mockGetUserPreferences = vi.fn();
const mockSetUserBetaPreference = vi.fn();
const mockNavigate = vi.fn();
const mockLogout = vi.fn();
const mockAddNotification = vi.fn();

vi.mock('../firestore-utils/auth-context', () => ({
  useAuth: () => ({ user: { uid: 'u1', email: 'test@example.com' }, logout: mockLogout, loading: false }),
}));

vi.mock('../firestore-utils/notification-context', () => ({
  useNotification: () => ({ addNotification: mockAddNotification }),
}));

vi.mock('../firestore-utils/user-preferences', () => ({
  getUserPreferences: (...args: unknown[]) => mockGetUserPreferences(...args),
  setUserBetaPreference: (...args: unknown[]) => mockSetUserBetaPreference(...args),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderProfile = () =>
  render(
    <MemoryRouter>
      <Profile db={{} as never} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserPreferences.mockResolvedValue({ beta_enabled: false });
});

describe('Profile', () => {
  it('renders user email', async () => {
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });
  });

  it('renders account section', async () => {
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText('Account')).toBeInTheDocument();
    });
  });

  it('renders beta toggle section', async () => {
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText('Beta Program')).toBeInTheDocument();
      expect(screen.getByText('Join Beta')).toBeInTheDocument();
    });
  });

  it('loads user preferences and shows enabled state', async () => {
    mockGetUserPreferences.mockResolvedValue({ beta_enabled: true });
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText('Beta Enabled')).toBeInTheDocument();
      expect(screen.getByText('Enabled')).toBeInTheDocument();
    });
  });

  it('toggles beta on button click', async () => {
    mockSetUserBetaPreference.mockResolvedValue(undefined);
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText('Join Beta')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Enable'));
    await waitFor(() => {
      expect(mockSetUserBetaPreference).toHaveBeenCalledWith({}, 'u1', true);
    });
  });

  it('logs error on beta toggle failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSetUserBetaPreference.mockRejectedValue(new Error('update failed'));
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText('Enable')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Enable'));
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
      expect(mockAddNotification).toHaveBeenCalledWith('Failed to update beta preference', 'error');
    });
    consoleSpy.mockRestore();
  });

  it('shows saving state while updating beta', async () => {
    mockSetUserBetaPreference.mockImplementation(() => new Promise(() => {}));
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText('Enable')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Enable'));
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('does not render Your Apps section', async () => {
    renderProfile();
    await waitFor(() => {
      expect(screen.queryByText('Your Apps')).not.toBeInTheDocument();
      expect(screen.queryByText('Create New App')).not.toBeInTheDocument();
    });
  });

  it('renders Infrastructure section with configure button', async () => {
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText('Infrastructure')).toBeInTheDocument();
      expect(screen.getByText('Configure Infrastructure')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Configure Infrastructure'));
    expect(mockNavigate).toHaveBeenCalledWith('/infra-setup');
  });

  it('handles logout and navigates home', async () => {
    mockLogout.mockResolvedValue(undefined);
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText('Sign Out')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Sign Out'));
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('shows notification on logout failure', async () => {
    mockLogout.mockRejectedValue(new Error('network error'));
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText('Sign Out')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Sign Out'));
    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith('Logout failed: network error', 'error');
    });
  });
});
