import { useCallback, useEffect, useState } from 'react';
import { getEditionNumber, getTodayUtcDateKey } from '../../shared/constants';
import type { SessionInitResponse } from '../../shared/types';

function createFallbackSession(): SessionInitResponse {
  const dateKey = getTodayUtcDateKey();
  const edition = getEditionNumber(dateKey);

  return {
    status: 'ok',
    postId: 'local-dev',
    username: 'architect',
    isAuthenticated: true,
    dateKey,
    edition,
    communitySolves: 42,
    communityPulse: {
      totalSolves: 42,
      perfectSolves: 9,
      jadeRatePercent: 21,
      avgMoves: 16,
      avgElapsedMs: 44_000,
    },
    commentSharedToday: false,
    streak: 3,
    bestStreak: 5,
    dailyCompleted: false,
    personalRank: null,
    percentile: null,
    completedRecords: [],
    leaderboard: {
      dateKey,
      edition,
      totalPlayers: 3,
      entries: [
        {
          rank: 1,
          username: 'celestial_scribe',
          score: 1100,
          moves: 11,
          elapsedMs: 26_400,
          isPerfect: true,
        },
        {
          rank: 2,
          username: 'basalt_mason',
          score: 964,
          moves: 15,
          elapsedMs: 39_100,
          isPerfect: false,
        },
        {
          rank: 3,
          username: 'meridian_fox',
          score: 880,
          moves: 18,
          elapsedMs: 51_000,
          isPerfect: false,
        },
      ],
      personalRank: null,
      percentile: null,
      personalEntry: null,
    },
  };
}

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
        if (!cancelled) {
          setSession(createFallbackSession());
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

  const updateSession = useCallback(
    (updater: (prev: SessionInitResponse) => SessionInitResponse) => {
      setSession((prev) => (prev ? updater(prev) : prev));
    },
    []
  );

  return { session, loading, updateSession };
}