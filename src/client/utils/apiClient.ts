import { showToast } from '@devvit/web/client';
import type {
  ApiErrorResponse,
  CompletePuzzleRequest,
  CompletePuzzleResponse,
  DailyLeaderboardSnapshot,
  LeaderboardApiResponse,
  ShareCommentRequest,
  ShareCommentResponse,
} from '../../shared/types';

function safeToast(message: string): void {
  try {
    showToast(message);
  } catch {
    // Standalone browser fallback
  }
}

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

export async function postResultCommentToThread(
  payload: ShareCommentRequest
): Promise<{ ok: boolean; alreadyShared: boolean }> {
  try {
    const res = await fetch('/api/share-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = (await res
        .json()
        .catch(() => null)) as ApiErrorResponse | null;
      safeToast(errData?.message ?? 'Could not post to Reddit thread');
      return { ok: false, alreadyShared: false };
    }

    const data = (await res.json()) as ShareCommentResponse;
    if (data.status === 'ok') {
      safeToast(
        data.alreadyShared
          ? 'Your seal is already inscribed in today’s thread'
          : 'Seal inscribed to today’s Ritual Ledger'
      );
      return { ok: true, alreadyShared: data.alreadyShared };
    }

    return { ok: false, alreadyShared: false };
  } catch {
    safeToast('Thread sharing requires an active Reddit post');
    return { ok: false, alreadyShared: false };
  }
}