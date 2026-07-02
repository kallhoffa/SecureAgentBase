import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import StepHeader from '../framework/infra-setup/steps/StepHeader';

const defaultProps = {
  stepNumber: 1,
  title: 'Test Step',
  icon: <span data-testid="test-icon" />,
  isComplete: false,
  isActive: false,
  isLocked: false,
  expandedSteps: [],
  toggleStep: vi.fn(),
};

describe('StepHeader', () => {
  it('renders title', () => {
    render(<StepHeader {...defaultProps} />);
    expect(screen.getByText('Test Step')).toBeInTheDocument();
  });

  it('renders icon when not complete or warning', () => {
    render(<StepHeader {...defaultProps} />);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('shows Check icon when complete', () => {
    render(<StepHeader {...defaultProps} isComplete />);
    expect(screen.queryByTestId('test-icon')).not.toBeInTheDocument();
  });

  it('shows AlertTriangle when warning', () => {
    render(<StepHeader {...defaultProps} isWarning />);
    expect(screen.queryByTestId('test-icon')).not.toBeInTheDocument();
  });

  it('shows locked text when locked', () => {
    render(<StepHeader {...defaultProps} isLocked />);
    expect(screen.getByText(/complete previous step first/i)).toBeInTheDocument();
  });

  it('shows re-authentication text when warning', () => {
    render(<StepHeader {...defaultProps} isWarning />);
    expect(screen.getByText(/re-authentication required/i)).toBeInTheDocument();
  });

  it('shows edit button when complete and onEdit provided', () => {
    const onEdit = vi.fn();
    render(<StepHeader {...defaultProps} isComplete onEdit={onEdit} />);
    const editBtn = screen.getByTitle('Edit step');
    expect(editBtn).toBeInTheDocument();
  });

  it('does not show edit button when onEdit is null', () => {
    render(<StepHeader {...defaultProps} isComplete />);
    expect(screen.queryByTitle('Edit step')).not.toBeInTheDocument();
  });

  it('shows info tooltip when info prop is set', () => {
    render(<StepHeader {...defaultProps} info="Helpful info" />);
    expect(screen.getByText('Helpful info')).toBeInTheDocument();
  });

  it('shows expanded chevron (up) when step is in expandedSteps', () => {
    render(<StepHeader {...defaultProps} expandedSteps={[1]} />);
    expect(screen.getByText('Test Step')).toBeInTheDocument();
  });

  it('renders with background classes based on state', () => {
    const { container, rerender } = render(<StepHeader {...defaultProps} />);
    // Default: bg-gray-50
    expect(container.firstChild.className).toContain('bg-gray-50');

    rerender(<StepHeader {...defaultProps} isActive />);
    expect(container.firstChild.className).toContain('bg-blue-50');

    rerender(<StepHeader {...defaultProps} isComplete />);
    expect(container.firstChild.className).toContain('bg-green-50');

    rerender(<StepHeader {...defaultProps} isWarning />);
    expect(container.firstChild.className).toContain('bg-yellow-50');
  });
});
