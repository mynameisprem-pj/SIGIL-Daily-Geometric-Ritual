import type {
  CompletePuzzleRequest,
  CompletePuzzleResponse,
  DailyLeaderboardSnapshot,
  LeaderboardApiResponse,
} from '../../shared/types';

export async function submitPuzzleCompletion(
  payload: CompletePuzzleRequest
): Promise<CompletePuzzleResponse | null> {
  try {
    const res = await fetch('/api/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CompletePuzzleResponse;
    return data.status === 'ok' ? data : null;
  } catch {
    // Graceful fallback when running standalone Vite preview outside Devvit server
    return null;
  }
}

export async function fetchDailyLeaderboard(
  dateKey?: string
): Promise<DailyLeaderboardSnapshot | null> {
  try {
    const query = dateKey ? `?dateKey=${encodeURIComponent(dateKey)}` : '';
    const res = await fetch(`/api/leaderboard${query}`);
    if (!res.ok) return null;
    const data = (await res.json()) as LeaderboardApiResponse;
    return data.status === 'ok' ? data.leaderboard : null;
  } catch {
    return null;
  }
}