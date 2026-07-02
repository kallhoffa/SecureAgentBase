import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '../login';

const mockSignIn = vi.fn();
const mockSignInWithGoogle = vi.fn();
const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();

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

const renderLogin = (search = '') =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', search }]}>
      <Login />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({
    signIn: mockSignIn,
    signInWithGoogle: mockSignInWithGoogle,
  });
});

describe('Login extended', () => {
  it('shows error message on failed sign in', async () => {
    mockSignIn.mockRejectedValue(new Error('Invalid credentials'));
    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'bad@email.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('shows "Login failed" when error is not an Error instance', async () => {
    mockSignIn.mockRejectedValue('string error');
    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => {
      expect(screen.getByText('Login failed')).toBeInTheDocument();
    });
  });

  it('navigates to returnUrl on successful sign in', async () => {
    mockSignIn.mockResolvedValue(undefined);
    renderLogin('?returnUrl=/tasks');
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/tasks');
    });
  });

  it('navigates to / on successful sign in with no returnUrl', async () => {
    mockSignIn.mockResolvedValue(undefined);
    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('shows loading state while submitting', async () => {
    mockSignIn.mockImplementation(() => new Promise(() => {}));
    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(screen.getByRole('button', { name: 'Signing in...' })).toBeInTheDocument();
  });

  it('shows error on failed Google sign in', async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error('Google error'));
    renderLogin();
    fireEvent.click(screen.getByText(/sign in with google/i));
    await waitFor(() => {
      expect(screen.getByText('Google error')).toBeInTheDocument();
    });
  });

  it('shows "Google login failed" when Google error is not an Error instance', async () => {
    mockSignInWithGoogle.mockRejectedValue('string error');
    renderLogin();
    fireEvent.click(screen.getByText(/sign in with google/i));
    await waitFor(() => {
      expect(screen.getByText('Google login failed')).toBeInTheDocument();
    });
  });

  it('navigates to returnUrl on successful Google sign in', async () => {
    mockSignInWithGoogle.mockResolvedValue(undefined);
    renderLogin('?returnUrl=/profile');
    fireEvent.click(screen.getByText(/sign in with google/i));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/profile');
    });
  });
});
