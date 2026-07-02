import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Post from '../post';

const mockGetPost = vi.fn();
const mockGetReplies = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../firestore-utils/post-storage', () => ({
  getPost: (...args: unknown[]) => mockGetPost(...args),
  getReplies: (...args: unknown[]) => mockGetReplies(...args),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderPost = (search = '?id=post-1') =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/post', search }]}>
      <Post db={{} as never} />
    </MemoryRouter>
  );

const mockPost = {
  id: 'post-1',
  title: 'Test Post',
  content: 'This is the post content.',
  authorId: 'u1',
  authorName: 'Alice',
  replyCount: 3,
  createdAt: new Date('2024-06-15'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPost.mockResolvedValue(mockPost);
  mockGetReplies.mockResolvedValue([]);
});

describe('Post', () => {
  it('shows loading state initially', () => {
    mockGetPost.mockReturnValue(new Promise(() => {}));
    renderPost();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows error when no post id in URL', async () => {
    renderPost('');
    await waitFor(() => {
      expect(screen.getByText('No post specified')).toBeInTheDocument();
    });
  });

  it('shows error when post not found', async () => {
    mockGetPost.mockResolvedValue(null);
    renderPost();
    await waitFor(() => {
      expect(screen.getByText('Post not found')).toBeInTheDocument();
    });
  });

  it('shows error on load failure', async () => {
    mockGetPost.mockRejectedValue(new Error('fail'));
    renderPost();
    await waitFor(() => {
      expect(screen.getByText('Failed to load post')).toBeInTheDocument();
    });
  });

  it('renders post title, content, and author', async () => {
    renderPost();
    await waitFor(() => {
      expect(screen.getByText('Test Post')).toBeInTheDocument();
      expect(screen.getByText('This is the post content.')).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
  });

  it('renders back button', async () => {
    renderPost();
    await waitFor(() => {
      expect(screen.getByText('← Back to posts')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('← Back to posts'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows empty replies state', async () => {
    renderPost();
    await waitFor(() => {
      expect(screen.getByText('0 Replies')).toBeInTheDocument();
      expect(screen.getByText(/no replies yet/i)).toBeInTheDocument();
    });
  });

  it('renders replies when present', async () => {
    mockGetReplies.mockResolvedValue([
      { id: 'r1', postId: 'post-1', content: 'First reply', authorId: 'u2', authorName: 'Bob', createdAt: new Date('2024-06-16') },
      { id: 'r2', postId: 'post-1', content: 'Second reply', authorId: 'u3', authorName: 'Charlie', createdAt: new Date('2024-06-17') },
    ]);
    renderPost();
    await waitFor(() => {
      expect(screen.getByText('First reply')).toBeInTheDocument();
      expect(screen.getByText('Second reply')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();
      expect(screen.getByText('2 Replies')).toBeInTheDocument();
    });
  });

  it('shows add reply button and navigates', async () => {
    renderPost();
    await waitFor(() => {
      expect(screen.getAllByText(/add reply/i)[0]).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText(/add reply/i)[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/compose-reply?id=post-1');
  });

  it('shows back to posts button on error page', async () => {
    mockGetPost.mockResolvedValue(null);
    renderPost();
    await waitFor(() => {
      expect(screen.getByText('Back to posts')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Back to posts'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
