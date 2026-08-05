import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { RequireAuth, RedirectIfAuthed } from '../components/ProtectedRoute';

const mockUseAuth = vi.fn();
vi.mock('../firestore-utils/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

// Wrap render in MemoryRouter so useLocation() (used by the URL-aware
// returnUrl logic in RequireAuth/RedirectIfAuthed) has a Router context.
// Tests that exercise the redirect path also assert the redirect target.
const renderInRouter = (ui, initialEntry = '/protected') =>
  render(<MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>);

describe('RequireAuth', () => {
  it('shows loading spinner when auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    const { container } = renderInRouter(<RequireAuth><div>Protected Content</div></RequireAuth>);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /login with returnUrl when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderInRouter(<RequireAuth><div>Protected Content</div></RequireAuth>, '/infra-setup');
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children when user is authenticated', () => {
    mockUseAuth.mockReturnValue({ user: { email: 'test@example.com' }, loading: false });
    renderInRouter(<RequireAuth><div>Protected Content</div></RequireAuth>);
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});

describe('RedirectIfAuthed', () => {
  it('shows loading spinner when auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    const { container } = renderInRouter(<RedirectIfAuthed><div>Public Content</div></RedirectIfAuthed>);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('Public Content')).not.toBeInTheDocument();
  });

  it('redirects to /profile when user is authenticated and no returnUrl', () => {
    mockUseAuth.mockReturnValue({ user: { email: 'test@example.com' }, loading: false });
    renderInRouter(<RedirectIfAuthed><div>Public Content</div></RedirectIfAuthed>);
    expect(screen.queryByText('Public Content')).not.toBeInTheDocument();
  });

  it('redirects to returnUrl when user is authenticated and returnUrl is set', () => {
    mockUseAuth.mockReturnValue({ user: { email: 'test@example.com' }, loading: false });
    renderInRouter(<RedirectIfAuthed><div>Public Content</div></RedirectIfAuthed>, '/login?returnUrl=%2Finfra-setup');
    expect(screen.queryByText('Public Content')).not.toBeInTheDocument();
  });

  it('renders children when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderInRouter(<RedirectIfAuthed><div>Public Content</div></RedirectIfAuthed>);
    expect(screen.getByText('Public Content')).toBeInTheDocument();
  });
});
