import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFeatureFlag } from '../guardrails/useFeatureFlag';

const mockOnSnapshot = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'mocked-doc-ref'),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => true, data: () => ({ enabled: true }) })),
  onSnapshot: (...args) => {
    mockOnSnapshot(...args);
    return () => {};
  },
}));

describe('useFeatureFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns default value when flag does not exist', () => {
    const { result } = renderHook(() => useFeatureFlag({}, 'nonexistent-flag', false));
    expect(result.current).toBe(false);
  });

  it('subscribes to Firestore document', () => {
    renderHook(() => useFeatureFlag({}, 'test-flag', false));
    expect(mockOnSnapshot).toHaveBeenCalled();
  });

  it('skips subscription when db is null', () => {
    renderHook(() => useFeatureFlag(null, 'test-flag', false));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('skips subscription without flag name', () => {
    renderHook(() => useFeatureFlag({}, '', false));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });
});
