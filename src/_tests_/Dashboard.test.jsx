import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from '../template/pages/Dashboard';

const mockUseAuth = vi.fn();
vi.mock('../firestore-utils/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

const renderDashboard = () =>
  render(
    <BrowserRouter>
      <Dashboard />
    </BrowserRouter>
  );

beforeEach(() => {
  mockUseAuth.mockReset();
});

describe('Dashboard', () => {
  it('renders welcome heading with app name', () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderDashboard();
    expect(screen.getByText(/Welcome to /)).toBeInTheDocument();
  });

  it('shows Sign In button when user is null', () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderDashboard();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('shows Create Account button when user is null', () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderDashboard();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('hides sign-in section when user is logged in', () => {
    mockUseAuth.mockReturnValue({ user: { uid: '123', email: 'test@test.com' } });
    renderDashboard();
    expect(screen.queryByRole('button', { name: 'Sign In' })).not.toBeInTheDocument();
  });

  it('renders all 4 quick link cards', () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderDashboard();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
  });

  it('renders the description for Tasks card', () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderDashboard();
    expect(screen.getByText('Manage your tasks with Firestore CRUD')).toBeInTheDocument();
  });
});
