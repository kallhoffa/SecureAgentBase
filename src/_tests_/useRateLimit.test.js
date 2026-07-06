import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRateLimit } from '../guardrails/useRateLimit';

describe('useRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows actions within limit', () => {
    const { result } = renderHook(() => useRateLimit('test', 5));
    for (let i = 0; i < 5; i++) {
      expect(result.current.canAct).toBe(true);
      act(() => { result.current.check(); });
    }
  });

  it('blocks actions when limit exceeded', () => {
    const { result } = renderHook(() => useRateLimit('test', 3));
    for (let i = 0; i < 3; i++) {
      act(() => { result.current.check(); });
    }
    const allowed = result.current.check();
    expect(allowed).toBe(false);
  });

  it('resets after 60 seconds', () => {
    const { result } = renderHook(() => useRateLimit('test', 2));
    act(() => { result.current.check(); });
    act(() => { result.current.check(); });
    expect(result.current.check()).toBe(false);

    act(() => { vi.advanceTimersByTime(60001); });

    expect(result.current.check()).toBe(true);
  });

  it('tracks remaining count', () => {
    const { result } = renderHook(() => useRateLimit('test', 5));
    expect(result.current.remaining).toBe(5);
    act(() => { result.current.check(); });
    expect(result.current.remaining).toBe(4);
    act(() => { result.current.check(); });
    expect(result.current.remaining).toBe(3);
  });
});
