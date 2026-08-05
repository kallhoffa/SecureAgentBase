import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { RequireAuth, RedirectIfAuthed } from '../components/ProtectedRoute';

const mockUseAuth = vi.fn();
vi.mock('../firestore-utils/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

// Wrap render in a real <Routes> tree so Navigate() (used by RequireAuth
// and RedirectIfAuthed) swaps to the matching route once it fires.
// Rendering RequireAuth as the sole child of MemoryRouter causes an
// infinite redirect loop (RequireAuth re-renders at the new /login?
// returnUrl=... location and redirects again forever) which manifests
// as a 10-minute CI hang. With a Routes tree, after Navigate() the
// dispatcher renders the matching route element instead of the same ui,
// breaking the cycle.
//
// `atPath` is which path the component-under-test mounts at (so RequireAuth
// tests mount at '/' and RedirectIfAuthed tests mount at '/login' — same
// mounting decisions as App.tsx routes).
// `initialEntry` is where the test starts.
const renderInRouter = (slot, opts = {}) => {
  const { atPath = '/', initialEntry = atPath } = opts;
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path={atPath} element={slot} />
        <Route path="/infra-setup" element={<div>Navigated to infra-setup</div>} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/profile" element={<div>Profile Page</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('RequireAuth', () => {
  it('shows loading spinner when auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    const { container } = renderInRouter(<RequireAuth><div>Protected Content</div></RequireAuth>);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /login (with returnUrl) when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderInRouter(<RequireAuth><div>Protected Content</div></RequireAuth>);
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
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
    const { container } = renderInRouter(<RedirectIfAuthed><div>Public Content</div></RedirectIfAuthed>, { atPath: '/login' });
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('Public Content')).not.toBeInTheDocument();
  });

  it('redirects to /profile when user is authenticated and no returnUrl', () => {
    mockUseAuth.mockReturnValue({ user: { email: 'test@example.com' }, loading: false });
    renderInRouter(<RedirectIfAuthed><div>Public Content</div></RedirectIfAuthed>, { atPath: '/login' });
    expect(screen.queryByText('Public Content')).not.toBeInTheDocument();
    expect(screen.getByText('Profile Page')).toBeInTheDocument();
  });

  it('redirects to returnUrl when user is authenticated and returnUrl is set', () => {
    mockUseAuth.mockReturnValue({ user: { email: 'test@example.com' }, loading: false });
    renderInRouter(
      <RedirectIfAuthed><div>Public Content</div></RedirectIfAuthed>,
      { atPath: '/login', initialEntry: '/login?returnUrl=%2Finfra-setup' }
    );
    expect(screen.queryByText('Public Content')).not.toBeInTheDocument();
    expect(screen.getByText('Navigated to infra-setup')).toBeInTheDocument();
  });

  it('renders children when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderInRouter(<RedirectIfAuthed><div>Public Content</div></RedirectIfAuthed>, { atPath: '/login' });
    expect(screen.getByText('Public Content')).toBeInTheDocument();
  });
});
