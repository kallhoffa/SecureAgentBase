import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import About from '../about';

describe('About', () => {
  it('renders the About heading', () => {
    render(<About />);
    expect(screen.getByRole('heading', { name: /about secureagentbase/i })).toBeInTheDocument();
  });

  it('renders the Features section', () => {
    render(<About />);
    expect(screen.getByRole('heading', { name: /features/i })).toBeInTheDocument();
  });

  it('renders the Getting Started section', () => {
    render(<About />);
    expect(screen.getByRole('heading', { name: /getting started/i })).toBeInTheDocument();
  });

  it('renders feature list items', () => {
    render(<About />);
    expect(screen.getByText(/react 19/i)).toBeInTheDocument();
    expect(screen.getByText(/firebase authentication/i)).toBeInTheDocument();
    expect(screen.getAllByText(/firestore/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders setup command', () => {
    render(<About />);
    expect(screen.getByText(/npm run setup/)).toBeInTheDocument();
  });
});
