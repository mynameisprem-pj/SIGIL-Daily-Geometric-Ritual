import { useEffect, useState } from 'react';
import { getEditionNumber, getTodayUtcDateKey } from '../../shared/constants';
import type { SessionInitResponse } from '../../shared/types';

export function useSession() {
  const [session, setSession] = useState<SessionInitResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/session');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as SessionInitResponse;
        if (!cancelled && data.status === 'ok') {
          setSession(data);
          setLoading(false);
          return;
        }
      } catch {
        // Fallback for standalone Vite browser testing outside Reddit iframe
        if (!cancelled) {
          const dateKey = getTodayUtcDateKey();
          setSession({
            status: 'ok',
            postId: 'local-dev',
            username: 'architect',
            dateKey,
            edition: getEditionNumber(dateKey),
            communitySolves: 42,
            streak: 3,
            dailyCompleted: false,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { session, loading };
}