import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ComposeReply from '../compose-reply';

const mockGetPost = vi.fn();
const mockAddReply = vi.fn();
const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('../firestore-utils/post-storage', () => ({
  getPost: (...args: unknown[]) => mockGetPost(...args),
  addReply: (...args: unknown[]) => mockAddReply(...args),
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

const mockPost = { id: 'post-1', title: 'Original Post', content: 'Body', authorId: 'u1', authorName: 'Alice', replyCount: 1, createdAt: new Date() };

const renderComposeReply = (search = '?id=post-1') =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/compose-reply', search }]}>
      <ComposeReply db={{} as never} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { uid: 'u2', email: 'replyer@example.com' } });
  mockGetPost.mockResolvedValue(mockPost);
  mockAddReply.mockResolvedValue('reply-1');
});

describe('ComposeReply', () => {
  it('shows sign in prompt when user is not logged in', () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderComposeReply();
    expect(screen.getByText(/please sign in to reply/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Sign In'));
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('shows post not found when post does not exist', async () => {
    mockGetPost.mockResolvedValue(null);
    renderComposeReply();
    await waitFor(() => {
      expect(screen.getByText('Post not found')).toBeInTheDocument();
    });
  });

  it('shows loading state when no id in URL', async () => {
    renderComposeReply('');
    await waitFor(() => {
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  it('renders form with post title when loaded', async () => {
    renderComposeReply();
    await waitFor(() => {
      expect(screen.getByText('Replying to')).toBeInTheDocument();
      expect(screen.getByText('Original Post')).toBeInTheDocument();
      expect(screen.getByText('Your Reply')).toBeInTheDocument();
      expect(screen.getByLabelText(/write your reply/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Submit Reply' })).toBeInTheDocument();
    });
  });

  it('shows error on submit with empty content', async () => {
    renderComposeReply();
    await waitFor(() => {
      expect(screen.getByText('Your Reply')).toBeInTheDocument();
    });
    const form = screen.getByRole('button', { name: 'Submit Reply' }).closest('form');
    fireEvent.submit(form!);
    await waitFor(() => {
      expect(screen.getByText('Reply content cannot be empty')).toBeInTheDocument();
    });
    expect(mockAddReply).not.toHaveBeenCalled();
  });

  it('calls addReply and navigates on success', async () => {
    renderComposeReply();
    await waitFor(() => {
      expect(screen.getByText('Your Reply')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/write your reply/i), { target: { value: 'Nice post!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Reply' }));
    await waitFor(() => {
      expect(mockAddReply).toHaveBeenCalledWith({}, 'post-1', {
        content: 'Nice post!',
        authorId: 'u2',
        authorName: 'replyer@example.com',
      });
      expect(mockNavigate).toHaveBeenCalledWith('/post?id=post-1');
    });
  });

  it('shows error on addReply failure', async () => {
    mockAddReply.mockRejectedValue(new Error('db fail'));
    renderComposeReply();
    await waitFor(() => {
      expect(screen.getByText('Your Reply')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/write your reply/i), { target: { value: 'Reply' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Reply' }));
    await waitFor(() => {
      expect(screen.getByText('Failed to add reply. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows submitting state while posting', async () => {
    mockAddReply.mockImplementation(() => new Promise(() => {}));
    renderComposeReply();
    await waitFor(() => {
      expect(screen.getByText('Your Reply')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/write your reply/i), { target: { value: 'Reply' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Reply' }));
    expect(screen.getByRole('button', { name: 'Submitting...' })).toBeInTheDocument();
  });

  it('navigates back on cancel', async () => {
    renderComposeReply();
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockNavigate).toHaveBeenCalledWith('/post?id=post-1');
  });

  it('navigates back via back button', async () => {
    renderComposeReply();
    await waitFor(() => {
      expect(screen.getByText('← Back to post')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('← Back to post'));
    expect(mockNavigate).toHaveBeenCalledWith('/post?id=post-1');
  });
});
