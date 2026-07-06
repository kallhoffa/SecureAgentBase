import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Tasks from '../template/pages/Tasks';

const mockUseAuth = vi.fn();
vi.mock('../firestore-utils/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ _mock: 'collection' })),
  query: vi.fn((ref) => ref),
  where: vi.fn(() => ({ _mock: 'where' })),
  orderBy: vi.fn(() => ({ _mock: 'orderBy' })),
  limit: vi.fn(() => ({ _mock: 'limit' })),
  getDocs: vi.fn(() => Promise.resolve({
    docs: [],
    empty: true,
    size: 0,
  })),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(() => ({ _mock: 'doc' })),
  serverTimestamp: vi.fn(() => new Date()),
}));

const mockDb = { _fake: 'firestore' };

const renderTasks = () =>
  render(<Tasks db={mockDb} />);

beforeEach(() => {
  mockUseAuth.mockReset();
});

describe('Tasks', () => {
  it('shows sign-in prompt when user is not logged in', () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderTasks();
    expect(screen.getByText('Sign in to manage your tasks.')).toBeInTheDocument();
  });

  it('shows the Tasks heading', () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderTasks();
    expect(screen.getAllByText('Tasks').length).toBeGreaterThanOrEqual(1);
  });

  it('does not show the add-task input when user is not logged in', () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderTasks();
    expect(screen.queryByPlaceholderText('Add a new task...')).not.toBeInTheDocument();
  });

  it('shows empty state when user is logged in with no tasks', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc', email: 'u@t.com' } });
    renderTasks();
    const emptyMsg = await screen.findByText('No tasks yet. Add one above!');
    expect(emptyMsg).toBeInTheDocument();
  });
});
