'use client';

import { useEffect, useState } from 'react';
import * as api from '@/lib/api';
import type { CodeToken } from '@/lib/types';

/** Keeps the current QR token fresh. Fetches a new one the moment the old one expires. */
export function useRotatingCode(sessionId: string) {
  const [token, setToken] = useState<CodeToken | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const t = await api.getSessionCode(sessionId);
        if (!alive) return;
        setToken(t);
        setError(null);
        timer = setTimeout(load, Math.max(500, t.expiresAt - Date.now() + 50));
      } catch (e) {
        if (!alive) return;
        setError(e);
        timer = setTimeout(load, 4000);
      }
    };
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [sessionId, attempt]);

  return { token, error, retry: () => setAttempt((a) => a + 1) };
}
