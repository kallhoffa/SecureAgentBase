import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Signup from '../signup';

const mockSignUp = vi.fn();
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

const renderSignup = (search = '') =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/signup', search }]}>
      <Signup />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({
    signUp: mockSignUp,
    signInWithGoogle: mockSignInWithGoogle,
  });
});

describe('Signup', () => {
  it('renders signup form with email, password, confirm password fields', () => {
    renderSignup();
    expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
  });

  it('shows link to sign in page', () => {
    renderSignup();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    renderSignup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'pass1' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'pass2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('shows error when password is less than 6 characters', async () => {
    renderSignup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    await waitFor(() => {
      expect(screen.getByText('Password must be at least 6 characters')).toBeInTheDocument();
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('calls signUp and navigates on success', async () => {
    mockSignUp.mockResolvedValue(undefined);
    renderSignup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith('a@b.com', 'password');
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('navigates to returnUrl on successful signup', async () => {
    mockSignUp.mockResolvedValue(undefined);
    renderSignup('?returnUrl=/dashboard');
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('displays error on failed signup', async () => {
    mockSignUp.mockRejectedValue(new Error('Email already in use'));
    renderSignup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'existing@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    await waitFor(() => {
      expect(screen.getByText('Email already in use')).toBeInTheDocument();
    });
  });

  it('shows "Signup failed" when error is not an Error instance', async () => {
    mockSignUp.mockRejectedValue('string error');
    renderSignup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    await waitFor(() => {
      expect(screen.getByText('Signup failed')).toBeInTheDocument();
    });
  });

  it('shows loading state while submitting', async () => {
    mockSignUp.mockImplementation(() => new Promise(() => {}));
    renderSignup();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    expect(screen.getByRole('button', { name: 'Creating account...' })).toBeInTheDocument();
  });

  it('shows error on failed Google signup', async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error('Google error'));
    renderSignup();
    fireEvent.click(screen.getByText(/sign up with google/i));
    await waitFor(() => {
      expect(screen.getByText('Google error')).toBeInTheDocument();
    });
  });

  it('shows "Google signup failed" when Google error is not an Error instance', async () => {
    mockSignInWithGoogle.mockRejectedValue('string error');
    renderSignup();
    fireEvent.click(screen.getByText(/sign up with google/i));
    await waitFor(() => {
      expect(screen.getByText('Google signup failed')).toBeInTheDocument();
    });
  });

  it('navigates to returnUrl on successful Google signup', async () => {
    mockSignInWithGoogle.mockResolvedValue(undefined);
    renderSignup('?returnUrl=/profile');
    fireEvent.click(screen.getByText(/sign up with google/i));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/profile');
    });
  });
});
