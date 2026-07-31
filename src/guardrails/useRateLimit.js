import { useState, useRef, useCallback } from 'react';

const getWindow = (counts, maxPerMinute) => {
  const now = Date.now();
  const windowStart = now - 60000;
  const active = counts.filter(t => t > windowStart);
  return {
    active,
    remaining: Math.max(0, maxPerMinute - active.length),
    resetIn: active.length === 0 ? 0 : Math.max(0, 60000 - (now - active[0])),
  };
};

export const useRateLimit = (action, maxPerMinute = 10) => {
  const counts = useRef([]);
  const [state, setState] = useState(() => getWindow([], maxPerMinute));

  const check = useCallback(() => {
    const now = Date.now();
    const windowStart = now - 60000;
    counts.current = counts.current.filter(t => t > windowStart);
    if (counts.current.length >= maxPerMinute) return false;
    counts.current.push(now);
    setState(getWindow(counts.current, maxPerMinute));
    return true;
  }, [maxPerMinute]);

  return { canAct: state.remaining > 0, check, remaining: state.remaining, resetIn: state.resetIn };
};
