import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NavigationBar from '../navigation-bar';

const mockUseAuth = vi.fn();
const mockUseNotification = vi.fn();

vi.mock('../firestore-utils/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../firestore-utils/notification-context', () => ({
  useNotification: () => mockUseNotification(),
}));

const mockNavigate = vi.fn();
const mockAddNotification = vi.fn();

const renderNav = (initialEntries = ['/']) => {
  mockUseAuth.mockReturnValue({
    user: null,
    logout: vi.fn(),
  });
  mockUseNotification.mockReturnValue({
    addNotification: mockAddNotification,
  });
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <NavigationBar navigate={mockNavigate} />
    </MemoryRouter>
  );
};

describe('NavigationBar', () => {
  it('renders the app name as heading', () => {
    renderNav();
    expect(screen.getByRole('heading', { name: /your app|secureagentbase/i })).toBeInTheDocument();
  });

  it('renders Sign In button when no user', () => {
    renderNav();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('renders Sign Up button when no user', () => {
    renderNav();
    expect(screen.getByText('Sign Up')).toBeInTheDocument();
  });

  it('renders About link', () => {
    renderNav();
    expect(screen.getByText('About')).toBeInTheDocument();
  });

  it('shows Profile and Logout when user is logged in', () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      logout: vi.fn(),
    });
    mockUseNotification.mockReturnValue({
      addNotification: mockAddNotification,
    });
    render(
      <MemoryRouter>
        <NavigationBar navigate={mockNavigate} />
      </MemoryRouter>
    );
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
    expect(screen.queryByText('Sign In')).not.toBeInTheDocument();
  });

  it('navigates to login on Sign In click', () => {
    renderNav();
    fireEvent.click(screen.getByText('Sign In'));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/login'));
  });

  it('navigates to signup on Sign Up click', () => {
    renderNav();
    fireEvent.click(screen.getByText('Sign Up'));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/signup'));
  });

  it('navigates to profile on Profile click', () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      logout: vi.fn(),
    });
    mockUseNotification.mockReturnValue({
      addNotification: mockAddNotification,
    });
    render(
      <MemoryRouter>
        <NavigationBar navigate={mockNavigate} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('Profile'));
    expect(mockNavigate).toHaveBeenCalledWith('/profile');
  });

  it('shows Tasks link for logged in users in template mode', () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      logout: vi.fn(),
    });
    mockUseNotification.mockReturnValue({
      addNotification: mockAddNotification,
    });
    render(
      <MemoryRouter>
        <NavigationBar navigate={mockNavigate} />
      </MemoryRouter>
    );
    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });

  it('does not show Tasks link when no user', () => {
    renderNav();
    expect(screen.queryByText('Tasks')).not.toBeInTheDocument();
  });
});
