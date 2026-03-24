import { describe, it, expect, vi } from 'vitest';
import { 
  createPost, 
  getPost, 
  getPosts, 
  addReply, 
  getReplies 
} from '../src/firestore-utils/post-storage';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, name) => ({ db, name })),
  addDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
  updateDoc: vi.fn(),
}));

import { 
  collection, 
  addDoc, 
  getDoc, 
  getDocs, 
  doc, 
  query, 
  orderBy, 
  limit,
  where,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';

describe('post-storage', () => {
  const mockDb = {};
  
  describe('createPost', () => {
    it('creates a post with correct data', async () => {
      const postData = {
        title: 'Test Post',
        content: 'Test content',
        authorId: 'user123',
        authorName: 'Test User'
      };
      
      const mockDocRef = { id: 'newPostId' };
      addDoc.mockResolvedValue(mockDocRef);
      
      const result = await createPost(mockDb, postData);
      
      expect(addDoc).toHaveBeenCalledWith(
        { db: mockDb, name: 'posts' },
        expect.objectContaining({
          ...postData,
          replyCount: 0,
          createdAt: expect.any(Date)
        })
      );
      
      expect(result).toBe('newPostId');
    });
  });
  
  describe('getPost', () => {
    it('returns post data when found', async () => {
      const mockData = { id: 'post123', title: 'Test' };
      const mockSnapshot = { exists: () => true, data: () => mockData };
      
      getDoc.mockResolvedValue(mockSnapshot);
      
      const result = await getPost(mockDb, 'post123');
      
      expect(doc).toHaveBeenCalledWith(mockDb, 'posts', 'post123');
      expect(result).toEqual({ id: 'post123', ...mockData });
    });
    
    it('returns null when post not found', async () => {
      const mockSnapshot = { exists: () => false };
      getDoc.mockResolvedValue(mockSnapshot);
      
      const result = await getPost(mockDb, 'nonexistent');
      
      expect(result).toBeNull();
    });
  });
  
  describe('getPosts', () => {
    it('returns array of posts', async () => {
      const mockDocs = [
        { id: 'post1', data: () => ({ title: 'Post 1' }) },
        { id: 'post2', data: () => ({ title: 'Post 2' }) }
      ];
      
      getDocs.mockResolvedValue({ docs: mockDocs });
      
      const result = await getPosts(mockDb);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'post1', title: 'Post 1' });
    });
  });
  
  describe('addReply', () => {
    it('adds reply and updates post count', async () => {
      const replyData = {
        content: 'Test reply',
        authorId: 'user123',
        authorName: 'Test User'
      };
      
      const mockDocRef = { id: 'reply123' };
      addDoc.mockResolvedValue(mockDocRef);
      
      const mockPostSnapshot = { 
        exists: () => true, 
        data: () => ({ replyCount: 5 }) 
      };
      getDoc.mockResolvedValue(mockPostSnapshot);
      
      const result = await addReply(mockDb, 'post123', replyData);
      
      expect(addDoc).toHaveBeenCalledWith(
        { db: mockDb, name: 'replies' },
        expect.objectContaining({
          ...replyData,
          postId: 'post123',
          createdAt: expect.any(Date)
        })
      );
      
      expect(updateDoc).toHaveBeenCalled();
      expect(result).toBe('reply123');
    });
  });
});
