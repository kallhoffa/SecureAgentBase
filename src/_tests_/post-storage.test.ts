import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

const mockCollection = vi.fn();
const mockAddDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockDoc = vi.fn();
const mockQuery = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockWhere = vi.fn();
const mockServerTimestamp = vi.fn(() => new Date('2024-01-01'));
const mockUpdateDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  addDoc: mockAddDoc,
  getDoc: mockGetDoc,
  getDocs: mockGetDocs,
  doc: mockDoc,
  query: mockQuery,
  orderBy: mockOrderBy,
  limit: mockLimit,
  where: mockWhere,
  serverTimestamp: mockServerTimestamp,
  updateDoc: mockUpdateDoc,
}));

const mockDb = {} as Firestore;

const makeDocSnap = (id: string, data: Record<string, unknown>): QueryDocumentSnapshot<DocumentData> => ({
  id,
  data: () => data as DocumentData,
  exists: () => true,
  get: (key: string) => data[key],
}) as unknown as QueryDocumentSnapshot<DocumentData>;

describe('post-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddDoc.mockResolvedValue({ id: 'new-post-id' });
    mockGetDocs.mockResolvedValue({ docs: [] });
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => ({}), id: 'doc-id' });
    mockCollection.mockReturnValue('posts-collection');
    mockDoc.mockReturnValue('post-doc-ref');
    mockQuery.mockReturnValue('query-ref');
  });

  describe('createPost', () => {
    it('creates a post and returns its id', async () => {
      const { createPost } = await import('../firestore-utils/post-storage');
      const postData = { title: 'Test', content: 'Body', authorId: 'u1', authorName: 'User' };
      const result = await createPost(mockDb, postData);
      expect(result).toBe('new-post-id');
      expect(mockAddDoc).toHaveBeenCalledWith('posts-collection', {
        ...postData,
        replyCount: 0,
        createdAt: mockServerTimestamp(),
      });
    });
  });

  describe('getPost', () => {
    it('returns post data when document exists', async () => {
      const { getPost } = await import('../firestore-utils/post-storage');
      const createdAt = new Date('2024-06-15');
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        id: 'post-1',
        data: () => ({
          title: 'My Post',
          content: 'Content',
          authorId: 'u1',
          authorName: 'User',
          replyCount: 3,
          createdAt: { toDate: () => createdAt },
        }),
      });
      const result = await getPost(mockDb, 'post-1');
      expect(result).toEqual({
        id: 'post-1',
        title: 'My Post',
        content: 'Content',
        authorId: 'u1',
        authorName: 'User',
        replyCount: 3,
        createdAt,
      });
      expect(mockDoc).toHaveBeenCalledWith(mockDb, 'posts', 'post-1');
    });

    it('returns null when document does not exist', async () => {
      const { getPost } = await import('../firestore-utils/post-storage');
      mockGetDoc.mockResolvedValue({
        exists: () => false,
        id: 'post-1',
        data: () => ({}),
      });
      const result = await getPost(mockDb, 'post-1');
      expect(result).toBeNull();
    });
  });

  describe('getPosts', () => {
    it('returns list of posts ordered by createdAt desc', async () => {
      const { getPosts } = await import('../firestore-utils/post-storage');
      const date1 = new Date('2024-06-15');
      const date2 = new Date('2024-06-14');
      mockGetDocs.mockResolvedValue({
        docs: [
          makeDocSnap('p1', { title: 'First', content: 'A', authorId: 'u1', authorName: 'U', replyCount: 2, createdAt: { toDate: () => date1 } }),
          makeDocSnap('p2', { title: 'Second', content: 'B', authorId: 'u2', authorName: 'V', replyCount: 0, createdAt: { toDate: () => date2 } }),
        ],
      });
      const result = await getPosts(mockDb, 10);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('p1');
      expect(result[0].createdAt).toBe(date1);
      expect(result[1].id).toBe('p2');
      expect(mockQuery).toHaveBeenCalled();
      expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it('uses default limit of 50', async () => {
      const { getPosts } = await import('../firestore-utils/post-storage');
      await getPosts(mockDb);
      expect(mockLimit).toHaveBeenCalledWith(50);
    });
  });

  describe('searchPosts', () => {
    it('queries with title range filter', async () => {
      const { searchPosts } = await import('../firestore-utils/post-storage');
      mockGetDocs.mockResolvedValue({ docs: [] });
      const result = await searchPosts(mockDb, 'test');
      expect(result).toEqual([]);
      expect(mockWhere).toHaveBeenCalledWith('title', '>=', 'test');
      expect(mockWhere).toHaveBeenCalledWith('title', '<=', 'test\uf8ff');
      expect(mockOrderBy).toHaveBeenCalledWith('title');
      expect(mockLimit).toHaveBeenCalledWith(20);
    });
  });

  describe('addReply', () => {
    it('adds a reply and increments replyCount on post', async () => {
      const { addReply } = await import('../firestore-utils/post-storage');
      mockAddDoc.mockResolvedValue({ id: 'reply-1' });
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ replyCount: 2 }),
      });
      const result = await addReply(mockDb, 'post-1', {
        content: 'My reply',
        authorId: 'u1',
        authorName: 'User',
      });
      expect(result).toBe('reply-1');
      expect(mockAddDoc).toHaveBeenCalled();
      expect(mockUpdateDoc).toHaveBeenCalledWith('post-doc-ref', { replyCount: 3 });
    });

    it('handles replyCount when post has no replyCount field', async () => {
      const { addReply } = await import('../firestore-utils/post-storage');
      mockAddDoc.mockResolvedValue({ id: 'reply-1' });
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({}),
      });
      const result = await addReply(mockDb, 'post-1', {
        content: 'Reply',
        authorId: 'u1',
        authorName: 'U',
      });
      expect(result).toBe('reply-1');
      expect(mockUpdateDoc).toHaveBeenCalledWith('post-doc-ref', { replyCount: 1 });
    });

    it('does not update post if post does not exist', async () => {
      const { addReply } = await import('../firestore-utils/post-storage');
      mockAddDoc.mockResolvedValue({ id: 'reply-2' });
      mockGetDoc.mockResolvedValue({
        exists: () => false,
        data: () => ({}),
      });
      await addReply(mockDb, 'post-missing', {
        content: 'Reply',
        authorId: 'u1',
        authorName: 'U',
      });
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });
  });

  describe('getReplies', () => {
    it('returns replies for a post ordered by createdAt asc', async () => {
      const { getReplies } = await import('../firestore-utils/post-storage');
      const date1 = new Date('2024-06-15T10:00:00');
      const date2 = new Date('2024-06-15T11:00:00');
      mockGetDocs.mockResolvedValue({
        docs: [
          makeDocSnap('r1', { postId: 'post-1', content: 'First', authorId: 'u1', authorName: 'U', createdAt: { toDate: () => date1 } }),
          makeDocSnap('r2', { postId: 'post-1', content: 'Second', authorId: 'u2', authorName: 'V', createdAt: { toDate: () => date2 } }),
        ],
      });
      const result = await getReplies(mockDb, 'post-1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('r1');
      expect(result[0].createdAt).toBe(date1);
      expect(result[1].id).toBe('r2');
      expect(mockWhere).toHaveBeenCalledWith('postId', '==', 'post-1');
      expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'asc');
    });
  });
});
