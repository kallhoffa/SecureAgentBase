import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import EnvironmentBanner from '../environment-banner';

const originalLocation = window.location;

vi.mock('../firebase', () => ({
  getFirebaseApp: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

const setHostname = (hostname: string) => {
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, hostname },
    writable: true,
  });
};

describe('EnvironmentBanner', () => {
  it('shows LOCALHOST banner on localhost', () => {
    vi.stubEnv('VITE_APP_VERSION', 'dev');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'my-project');
    setHostname('localhost');
    render(<EnvironmentBanner />);
    expect(screen.getByText(/localhost/i)).toBeInTheDocument();
  });

  it('shows LOCALHOST banner on 127.0.0.1', () => {
    vi.stubEnv('VITE_APP_VERSION', 'dev');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'my-project');
    setHostname('127.0.0.1');
    render(<EnvironmentBanner />);
    expect(screen.getByText(/localhost/i)).toBeInTheDocument();
  });

  it('shows STAGING banner on staging hostname', () => {
    vi.stubEnv('VITE_APP_VERSION', 'dev');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'staging-proj');
    setHostname('staging.example.com');
    render(<EnvironmentBanner />);
    expect(screen.getByText(/staging/i)).toBeInTheDocument();
  });

  it('returns null for production hostname', () => {
    setHostname('example.com');
    const { container } = render(<EnvironmentBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('formats version with v prefix', () => {
    vi.stubEnv('VITE_APP_VERSION', 'v1.2.3');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'my-project');
    setHostname('localhost');
    render(<EnvironmentBanner />);
    expect(screen.getByText(/v1\.2\.3/)).toBeInTheDocument();
  });

  it('truncates long version strings', () => {
    vi.stubEnv('VITE_APP_VERSION', 'abc123def456');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'my-project');
    setHostname('localhost');
    render(<EnvironmentBanner />);
    expect(screen.getByText(/abc123d/)).toBeInTheDocument();
  });
});
