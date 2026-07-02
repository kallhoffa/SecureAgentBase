import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from '../firestore-utils/auth-context';

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((auth, cb) => {
    cb(null);
    return vi.fn();
  }),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn(() => ({})),
}));

const TestConsumer = () => {
  const { user, loading, signIn, signUp, signInWithGoogle, logout } = useAuth();
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'loaded'}</div>
      <div data-testid="user">{user ? user.email : 'no-user'}</div>
      <button onClick={() => signIn('a@b.com', 'pass')}>Sign In</button>
      <button onClick={() => signUp('a@b.com', 'pass')}>Sign Up</button>
      <button onClick={signInWithGoogle}>Google</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
};

describe('AuthProvider', () => {
  it('throws error when useAuth is used outside provider', () => {
    expect(() => render(<TestConsumer />)).toThrow(
      'useAuth must be used within an AuthProvider'
    );
  });

  it('provides auth context with default values', () => {
    render(
      <AuthProvider auth={{} as any}>
        <TestConsumer />
      </AuthProvider>
    );
    expect(screen.getByTestId('loading').textContent).toBe('loaded');
    expect(screen.getByTestId('user').textContent).toBe('no-user');
  });

  it('provides sign in action', async () => {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    render(
      <AuthProvider auth={{} as any}>
        <TestConsumer />
      </AuthProvider>
    );
    screen.getByText('Sign In').click();
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith({}, 'a@b.com', 'pass');
  });

  it('provides logout action', async () => {
    const { signOut } = await import('firebase/auth');
    render(
      <AuthProvider auth={{} as any}>
        <TestConsumer />
      </AuthProvider>
    );
    screen.getByText('Logout').click();
    expect(signOut).toHaveBeenCalledWith({});
  });

  it('subscribes to auth state changes on mount', async () => {
    const { onAuthStateChanged } = await import('firebase/auth');
    render(
      <AuthProvider auth={{} as any}>
        <TestConsumer />
      </AuthProvider>
    );
    expect(onAuthStateChanged).toHaveBeenCalledWith({}, expect.any(Function));
  });
});
