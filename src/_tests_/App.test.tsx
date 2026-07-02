import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

vi.mock('../firestore-utils/auth-context', () => ({
  useAuth: () => ({ loading: false, user: null }),
}));

vi.mock('../firestore-utils/notification-context', () => ({
  NotificationProvider: ({ children }: any) => <>{children}</>,
  useNotification: () => ({ addNotification: vi.fn(), notifications: [] }),
}));

vi.mock('../environment-banner', () => ({
  default: () => <div data-testid="env-banner" />,
}));

vi.mock('../navigation-bar', () => ({
  default: () => <nav data-testid="nav-bar" />,
}));

vi.mock('../about', () => ({
  default: () => <div>About Page</div>,
}));

vi.mock('../login', () => ({
  default: () => <div>Login Page</div>,
}));

vi.mock('../signup', () => ({
  default: () => <div>Signup Page</div>,
}));

vi.mock('../template', () => ({
  Dashboard: () => <div>Dashboard Page</div>,
  Tasks: () => <div>Tasks Page</div>,
}));

vi.mock('../posts', () => ({
  LandingPage: () => <div>Landing Page</div>,
}));

describe('App', () => {
  it('renders without crashing', () => {
    render(<App db={{} as any} auth={{} as any} />);
    expect(screen.getByTestId('env-banner')).toBeInTheDocument();
    expect(screen.getByTestId('nav-bar')).toBeInTheDocument();
  });

  it('renders HomePage with Dashboard by default (template mode)', () => {
    render(<App db={{} as any} auth={{} as any} />);
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });

  it('renders Login page at /login route', () => {
    window.history.pushState({}, '', '/login');
    render(<App db={{} as any} auth={{} as any} />);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders About page at /about route', () => {
    window.history.pushState({}, '', '/about');
    render(<App db={{} as any} auth={{} as any} />);
    expect(screen.getByText('About Page')).toBeInTheDocument();
  });

  it('renders Signup page at /signup route', () => {
    window.history.pushState({}, '', '/signup');
    render(<App db={{} as any} auth={{} as any} />);
    expect(screen.getByText('Signup Page')).toBeInTheDocument();
  });
});
