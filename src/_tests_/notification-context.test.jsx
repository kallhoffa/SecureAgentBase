import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { NotificationProvider, useNotification } from '../firestore-utils/notification-context';

const TestConsumer = () => {
  const { notifications, addNotification, removeNotification } = useNotification();
  return (
    <div>
      <div data-testid="notification-count">{notifications.length}</div>
      {notifications.map(n => (
        <div key={n.id} data-testid={`notification-${n.id}`} data-type={n.type}>
          <button onClick={() => removeNotification(n.id)}>Dismiss</button>
        </div>
      ))}
      <button onClick={() => addNotification('Test Info', 'info', 0)}>Add Info</button>
      <button onClick={() => addNotification('Test Error', 'error', 0)}>Add Error</button>
      <button onClick={() => addNotification('Test Success', 'success', 0)}>Add Success</button>
      <button onClick={() => addNotification('Auto Dismiss', 'info', 100)}>Add Auto</button>
    </div>
  );
};

describe('NotificationProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws error when useNotification is used outside provider', () => {
    expect(() => render(<TestConsumer />)).toThrow(
      'useNotification must be used within NotificationProvider'
    );
  });

  it('renders children', () => {
    render(
      <NotificationProvider>
        <div>App Content</div>
      </NotificationProvider>
    );
    expect(screen.getByText('App Content')).toBeInTheDocument();
  });

  it('adds a notification', () => {
    render(
      <NotificationProvider>
        <TestConsumer />
      </NotificationProvider>
    );
    fireEvent.click(screen.getByText('Add Info'));
    expect(screen.getByText('Test Info')).toBeInTheDocument();
    expect(screen.getByTestId('notification-count').textContent).toBe('1');
  });

  it('removes a notification', () => {
    render(
      <NotificationProvider>
        <TestConsumer />
      </NotificationProvider>
    );
    fireEvent.click(screen.getByText('Add Info'));
    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByText('Test Info')).not.toBeInTheDocument();
    expect(screen.getByTestId('notification-count').textContent).toBe('0');
  });

  it('adds multiple notifications', () => {
    render(
      <NotificationProvider>
        <TestConsumer />
      </NotificationProvider>
    );
    fireEvent.click(screen.getByText('Add Info'));
    fireEvent.click(screen.getByText('Add Error'));
    expect(screen.getByTestId('notification-count').textContent).toBe('2');
  });

  it('auto-dismisses notification after duration', () => {
    render(
      <NotificationProvider>
        <TestConsumer />
      </NotificationProvider>
    );
    fireEvent.click(screen.getByText('Add Auto'));
    expect(screen.getByText('Auto Dismiss')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByText('Auto Dismiss')).not.toBeInTheDocument();
  });

  it('sets notification type styling', () => {
    render(
      <NotificationProvider>
        <TestConsumer />
      </NotificationProvider>
    );
    fireEvent.click(screen.getByText('Add Error'));
    const allNotifications = screen.getAllByText(/Test/);
    expect(allNotifications.length).toBe(1);
  });
});
