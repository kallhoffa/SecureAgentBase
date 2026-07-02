import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from '../login';

const mockUseAuth = vi.fn();
vi.mock('../firestore-utils/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

const renderLogin = () =>
  render(
    <BrowserRouter>
      <Login />
    </BrowserRouter>
  );

beforeEach(() => {
  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue({
    signIn: vi.fn(),
    signInWithGoogle: vi.fn(),
  });
});

describe('Login', () => {
  it('renders the Sign In heading', () => {
    renderLogin();
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders email and password inputs', () => {
    renderLogin();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('renders Sign In submit button', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('renders Sign in with Google button', () => {
    renderLogin();
    expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
  });

  it('renders a link to sign up', () => {
    renderLogin();
    expect(screen.getByRole('link', { name: /sign up/i })).toBeInTheDocument();
  });
});
