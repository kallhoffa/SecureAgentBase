import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RequireAuth, RedirectIfAuthed } from '../components/ProtectedRoute';

const mockUseAuth = vi.fn();
vi.mock('../firestore-utils/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('RequireAuth', () => {
  it('shows loading spinner when auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    const { container } = render(<RequireAuth><div>Protected Content</div></RequireAuth>);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /login when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    render(
      <MemoryRouter initialEntries={['/']}>
        <RequireAuth><div>Protected Content</div></RequireAuth>
      </MemoryRouter>
    );
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children when user is authenticated', () => {
    mockUseAuth.mockReturnValue({ user: { email: 'test@example.com' }, loading: false });
    render(<RequireAuth><div>Protected Content</div></RequireAuth>);
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});

describe('RedirectIfAuthed', () => {
  it('shows loading spinner when auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    const { container } = render(<RedirectIfAuthed><div>Public Content</div></RedirectIfAuthed>);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('Public Content')).not.toBeInTheDocument();
  });

  it('redirects to /profile when user is authenticated', () => {
    mockUseAuth.mockReturnValue({ user: { email: 'test@example.com' }, loading: false });
    render(
      <MemoryRouter initialEntries={['/']}>
        <RedirectIfAuthed><div>Public Content</div></RedirectIfAuthed>
      </MemoryRouter>
    );
    expect(screen.queryByText('Public Content')).not.toBeInTheDocument();
  });

  it('renders children when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    render(<RedirectIfAuthed><div>Public Content</div></RedirectIfAuthed>);
    expect(screen.getByText('Public Content')).toBeInTheDocument();
  });
});
