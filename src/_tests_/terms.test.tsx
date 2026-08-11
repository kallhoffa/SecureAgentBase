import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Terms from '../terms';

const renderTerms = () =>
  render(
    <MemoryRouter>
      <Terms />
    </MemoryRouter>
  );

describe('Terms', () => {
  it('renders the Terms heading', () => {
    renderTerms();
    expect(screen.getByRole('heading', { name: /terms of service/i })).toBeInTheDocument();
  });

  it('renders the Acceptance section', () => {
    renderTerms();
    expect(screen.getByRole('heading', { name: /acceptance of terms/i })).toBeInTheDocument();
  });

  it('renders the Wizard and Google Cloud Access section', () => {
    renderTerms();
    expect(screen.getByRole('heading', { name: /wizard and google cloud access/i })).toBeInTheDocument();
  });

  it('renders the governing law section', () => {
    renderTerms();
    expect(screen.getByRole('heading', { name: /governing law/i })).toBeInTheDocument();
  });

  it('renders the contact email', () => {
    renderTerms();
    expect(screen.getAllByText(/kallhoff@gmail.com/).length).toBeGreaterThanOrEqual(1);
  });

  it('links to the privacy policy', () => {
    renderTerms();
    expect(screen.getAllByRole('link', { name: /privacy policy/i }).length).toBeGreaterThanOrEqual(1);
  });
});
