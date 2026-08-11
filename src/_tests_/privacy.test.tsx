import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Privacy from '../privacy';

const renderPrivacy = () =>
  render(
    <MemoryRouter>
      <Privacy />
    </MemoryRouter>
  );

describe('Privacy', () => {
  it('renders the Privacy Policy heading', () => {
    renderPrivacy();
    expect(screen.getByRole('heading', { name: /privacy policy/i })).toBeInTheDocument();
  });

  it('renders the Limited Use section (Google API Services)', () => {
    renderPrivacy();
    expect(screen.getByRole('heading', { name: /google api services limited use/i })).toBeInTheDocument();
  });

  it('renders the retention section', () => {
    renderPrivacy();
    expect(screen.getByRole('heading', { name: /data retention/i })).toBeInTheDocument();
  });

  it('renders the contact email', () => {
    renderPrivacy();
    expect(screen.getAllByText(/kallhoff@gmail.com/).length).toBeGreaterThanOrEqual(1);
  });

  it('links to the terms of service', () => {
    renderPrivacy();
    expect(screen.getByRole('link', { name: /terms of service/i })).toBeInTheDocument();
  });
});
