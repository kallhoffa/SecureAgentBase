import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from '../posts';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LandingPage', () => {
  it('renders hero section with heading and deploy button', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText('SecureAgentBase')).toBeInTheDocument();
    expect(screen.getByText(/build full-stack apps/i)).toBeInTheDocument();
    expect(screen.getByText(/deploy our secureagent/i)).toBeInTheDocument();
  });

  it('navigates to infra-setup on deploy click', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText(/deploy our secureagent/i));
    expect(mockNavigate).toHaveBeenCalledWith('/infra-setup');
  });

  it('renders three feature cards', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Discord-First')).toBeInTheDocument();
    expect(screen.getByText('GitHub Powered')).toBeInTheDocument();
    expect(screen.getByText('Cloud Deployed')).toBeInTheDocument();
  });

  it('renders how it works section', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText('How It Works')).toBeInTheDocument();
    expect(screen.getByText('Deploy SecureAgent')).toBeInTheDocument();
    expect(screen.getByText('Describe Your App')).toBeInTheDocument();
    expect(screen.getByText('AI Builds It')).toBeInTheDocument();
    expect(screen.getByText('Deploy')).toBeInTheDocument();
  });
});
