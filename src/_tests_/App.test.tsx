import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

const mockAuthUser = vi.hoisted(() => ({ user: null as any }));

vi.mock('../firestore-utils/auth-context', () => ({
  useAuth: () => ({ loading: false, user: mockAuthUser.user }),
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
  default: () => <div>Landing Page</div>,
}));

vi.mock('../post', () => ({
  default: () => <div>Post Page</div>,
}));

vi.mock('../compose-post', () => ({
  default: () => <div>Compose Post Page</div>,
}));

vi.mock('../compose-reply', () => ({
  default: () => <div>Compose Reply Page</div>,
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

  it('renders Privacy page at /privacy route', () => {
    window.history.pushState({}, '', '/privacy');
    render(<App db={{} as any} auth={{} as any} />);
    expect(screen.getByRole('heading', { name: /privacy policy/i })).toBeInTheDocument();
  });

  it('renders Terms page at /terms route', () => {
    window.history.pushState({}, '', '/terms');
    render(<App db={{} as any} auth={{} as any} />);
    expect(screen.getByRole('heading', { name: /terms of service/i })).toBeInTheDocument();
  });

  it('renders privacy and terms links in the footer', () => {
    window.history.pushState({}, '', '/');
    render(<App db={{} as any} auth={{} as any} />);
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toBeInTheDocument();
  });

  it('renders Signup page at /signup route', () => {
    window.history.pushState({}, '', '/signup');
    render(<App db={{} as any} auth={{} as any} />);
    expect(screen.getByText('Signup Page')).toBeInTheDocument();
  });

  describe('template mode (copied apps — posts enabled)', () => {
    it('renders the post view at /post', () => {
      window.history.pushState({}, '', '/post');
      render(<App db={{} as any} auth={{} as any} />);
      expect(screen.getByText('Post Page')).toBeInTheDocument();
    });

    it.each(['/compose-post', '/compose-reply'])(
      'renders the compose form at %s when signed in',
      (path) => {
        mockAuthUser.user = { uid: 'user-1' };
        window.history.pushState({}, '', path);
        render(<App db={{} as any} auth={{} as any} />);
        expect(screen.getByText(/Compose (Post|Reply) Page/)).toBeInTheDocument();
        mockAuthUser.user = null;
      }
    );
  });

  describe('app mode (template repo — posts blocked)', () => {
    it.each(['/post', '/compose-post', '/compose-reply'])(
      'redirects %s back to the landing page',
      async (path) => {
        vi.resetModules();
        vi.stubEnv('VITE_APP_MODE', 'true');
        const { default: AppAppMode } = await import('../App');
        window.history.pushState({}, '', path);
        render(<AppAppMode db={{} as any} auth={{} as any} />);
        expect(screen.getByText('Landing Page')).toBeInTheDocument();
        vi.unstubAllEnvs();
      }
    );
  });
});
