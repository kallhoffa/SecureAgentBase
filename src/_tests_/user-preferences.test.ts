import { describe, it, expect, vi } from 'vitest';
import { doc, getDoc } from 'firebase/firestore';
import { safeSet } from '../guardrails/safe-firestore';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, collection, id) => ({ db, collection, id })),
  getDoc: vi.fn(),
}));

vi.mock('../guardrails/safe-firestore', () => ({
  safeSet: vi.fn(),
}));

describe('user-preferences', () => {
  const mockDb = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserPreferences', () => {
    it('returns preferences when document exists', async () => {
      const mockData = { beta_enabled: true };
      (getDoc as any).mockResolvedValue({ exists: () => true, data: () => mockData });
      const { getUserPreferences } = await import('../firestore-utils/user-preferences');
      const result = await getUserPreferences(mockDb, 'user123');
      expect(result).toEqual({ beta_enabled: true });
      expect(doc).toHaveBeenCalledWith(mockDb, 'userPreferences', 'user123');
    });

    it('returns defaults when document does not exist', async () => {
      (getDoc as any).mockResolvedValue({ exists: () => false });
      const { getUserPreferences } = await import('../firestore-utils/user-preferences');
      const result = await getUserPreferences(mockDb, 'user123');
      expect(result).toEqual({ beta_enabled: false });
    });
  });

  describe('setUserBetaPreference', () => {
    it('writes beta preference through safeSet with allowlist and merge', async () => {
      const { setUserBetaPreference } = await import('../firestore-utils/user-preferences');
      await setUserBetaPreference(mockDb, 'user123', true);
      expect(safeSet).toHaveBeenCalledWith(
        mockDb,
        'userPreferences',
        'user123',
        { beta_enabled: true },
        'user123',
        { allowFields: ['beta_enabled'], merge: true }
      );
    });
  });
});
