import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import LandingPage from '../posts';

const mockNavigate = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LandingPage', () => {
  it('renders hero section with heading and two options', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText('SecureAgentBase')).toBeInTheDocument();
    expect(screen.getByText(/sovereign ai infrastructure/i)).toBeInTheDocument();
    expect(screen.getByText(/we fix the architecture/i)).toBeInTheDocument();
    expect(screen.getByText(/one-command bootstrap/i)).toBeInTheDocument();
    expect(screen.getByText(/web wizard/i)).toBeInTheDocument();
  });

  it('shows the guardrail pipeline in the dispatch mock', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/@agent add stripe webhook handling/i)).toBeInTheDocument();
    expect(screen.getByText(/spec drafted & validated/i)).toBeInTheDocument();
    expect(screen.getByText(/0 vulnerabilities/i)).toBeInTheDocument();
    expect(screen.getByText(/awaiting your approval/i)).toBeInTheDocument();
  });

  it('navigates to infra-setup on wizard click', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText(/launch setup wizard/i));
    expect(mockNavigate).toHaveBeenCalledWith('/infra-setup');
  });

  it('renders the three positioning pillars', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Deterministic Guardrails')).toBeInTheDocument();
    expect(screen.getByText('Sovereign BYO-Cloud')).toBeInTheDocument();
    expect(screen.getByText('Asynchronous Mobile Command')).toBeInTheDocument();
  });

  it('links to the source repository', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/view the source/i).closest('a')).toHaveAttribute(
      'href',
      'https://github.com/kallhoffa/SecureAgentBase'
    );
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
    expect(screen.getByText(/AI Builds It/i)).toBeInTheDocument();
    expect(screen.getByText('Deploy', { selector: 'h3' })).toBeInTheDocument();
  });
});
