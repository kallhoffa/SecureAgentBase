import { describe, it, expect, vi, beforeEach } from 'vitest';
import { safeCreate, safeUpdate, safeDelete, safeQuery } from '../guardrails/safe-firestore';

const mockAddDoc = vi.fn(() => ({ id: 'new-id' }));
const mockUpdateDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn(() => ({ docs: [] }));
const mockCollection = vi.fn();
const mockDoc = vi.fn();
const mockQuery = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockServerTimestamp = vi.fn(() => ({ type: 'timestamp' }));

vi.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  addDoc: (...args) => mockAddDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  doc: (...args) => mockDoc(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  orderBy: (...args) => mockOrderBy(...args),
  limit: (...args) => mockLimit(...args),
  serverTimestamp: (...args) => mockServerTimestamp(...args),
}));

const db = {};

describe('safeCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stamps audit fields', async () => {
    await safeCreate(db, 'tasks', { title: 'Test' }, 'user-1');
    expect(mockAddDoc).toHaveBeenCalledOnce();
    const data = mockAddDoc.mock.calls[0][1];
    expect(data.createdBy).toBe('user-1');
    expect(data.updatedBy).toBe('user-1');
    expect(data.createdAt).toEqual({ type: 'timestamp' });
    expect(data.updatedAt).toEqual({ type: 'timestamp' });
    expect(data.title).toBe('Test');
  });

  it('throws without userId', async () => {
    await expect(safeCreate(db, 'tasks', { title: 'Test' }, null))
      .rejects.toThrow('userId is required');
  });

  it('filters to allowFields only', async () => {
    await safeCreate(db, 'tasks', { title: 'Test', secret: 'leak', completed: false }, 'user-1', { allowFields: ['title', 'completed'] });
    const data = mockAddDoc.mock.calls[0][1];
    expect(data.title).toBe('Test');
    expect(data.completed).toBe(false);
    expect(data.secret).toBeUndefined();
  });

  it('strips reserved fields from input', async () => {
    await safeCreate(db, 'tasks', { title: 'Test', createdAt: 'nope' }, 'user-1');
    const data = mockAddDoc.mock.calls[0][1];
    expect(data.title).toBe('Test');
    expect(data.createdAt).toEqual({ type: 'timestamp' });
  });
});

describe('safeUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stamps updatedBy and updatedAt', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ createdBy: 'user-1' }) });
    await safeUpdate(db, 'tasks', 'doc-1', { title: 'Updated' }, 'user-1');
    const data = mockUpdateDoc.mock.calls[0][1];
    expect(data.updatedBy).toBe('user-1');
    expect(data.updatedAt).toEqual({ type: 'timestamp' });
    expect(data.title).toBe('Updated');
  });

  it('enforces requireOwnership', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ createdBy: 'other-user' }) });
    await expect(safeUpdate(db, 'tasks', 'doc-1', { title: 'Updated' }, 'user-1', { requireOwnership: true }))
      .rejects.toThrow(/do not have permission/);
  });

  it('throws if document not found with requireOwnership', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    await expect(safeUpdate(db, 'tasks', 'missing', {}, 'user-1', { requireOwnership: true }))
      .rejects.toThrow(/not found/);
  });
});

describe('safeDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes document', async () => {
    await safeDelete(db, 'tasks', 'doc-1', 'user-1');
    expect(mockDeleteDoc).toHaveBeenCalledOnce();
  });

  it('enforces requireOwnership', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ createdBy: 'other-user' }) });
    await expect(safeDelete(db, 'tasks', 'doc-1', 'user-1', { requireOwnership: true }))
      .rejects.toThrow(/do not have permission/);
  });
});

describe('safeQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws without userId', async () => {
    await expect(safeQuery(db, 'tasks', null))
      .rejects.toThrow('userId is required');
  });

  it('filters by createdBy and orders desc by default', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    await safeQuery(db, 'tasks', 'user-1', { maxResults: 50 });
    expect(mockWhere).toHaveBeenCalledWith('createdBy', '==', 'user-1');
    expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(mockLimit).toHaveBeenCalledWith(50);
  });

  it('maps results with id', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [{ id: 't1', data: () => ({ title: 'Task 1', completed: false }) }],
    });
    const results = await safeQuery(db, 'tasks', 'user-1');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('t1');
    expect(results[0].title).toBe('Task 1');
  });
});
