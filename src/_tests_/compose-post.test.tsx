import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ComposePost from '../compose-post';

const mockCreatePost = vi.fn();
const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('../firestore-utils/post-storage', () => ({
  createPost: (...args: unknown[]) => mockCreatePost(...args),
}));

vi.mock('../firestore-utils/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderComposePost = () =>
  render(
    <MemoryRouter>
      <ComposePost db={{} as never} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { uid: 'u1', email: 'test@example.com' } });
});

describe('ComposePost', () => {
  it('shows sign in prompt when user is not logged in', () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderComposePost();
    expect(screen.getByText(/please sign in/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Sign In'));
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('renders form when user is logged in', () => {
    renderComposePost();
    expect(screen.getByText('Create New Post')).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/content/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish Post' })).toBeInTheDocument();
  });

  it('shows error on submit with empty fields', async () => {
    renderComposePost();
    const form = screen.getByRole('button', { name: 'Publish Post' }).closest('form');
    fireEvent.submit(form!);
    await waitFor(() => {
      expect(screen.getByText('Title and content are required')).toBeInTheDocument();
    });
    expect(mockCreatePost).not.toHaveBeenCalled();
  });

  it('calls createPost and navigates on success', async () => {
    mockCreatePost.mockResolvedValue('post-123');
    renderComposePost();
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'My Title' } });
    fireEvent.change(screen.getByLabelText(/content/i), { target: { value: 'My content' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish Post' }));
    await waitFor(() => {
      expect(mockCreatePost).toHaveBeenCalledWith({}, {
        title: 'My Title',
        content: 'My content',
        authorId: 'u1',
        authorName: 'test@example.com',
      });
      expect(mockNavigate).toHaveBeenCalledWith('/post?id=post-123');
    });
  });

  it('shows error on createPost failure', async () => {
    mockCreatePost.mockRejectedValue(new Error('db error'));
    renderComposePost();
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Title' } });
    fireEvent.change(screen.getByLabelText(/content/i), { target: { value: 'Content' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish Post' }));
    await waitFor(() => {
      expect(screen.getByText('Failed to create post. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows submitting state while publishing', async () => {
    mockCreatePost.mockImplementation(() => new Promise(() => {}));
    renderComposePost();
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Title' } });
    fireEvent.change(screen.getByLabelText(/content/i), { target: { value: 'Content' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish Post' }));
    expect(screen.getByRole('button', { name: 'Publishing...' })).toBeInTheDocument();
  });

  it('navigates back on cancel', () => {
    renderComposePost();
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('navigates back via back button', () => {
    renderComposePost();
    fireEvent.click(screen.getByText('← Back to posts'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
