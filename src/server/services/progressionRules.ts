import type {
  CompletePuzzleRequest,
  GameMode,
  PersistedSealRecord,
} from '../../shared/types';

export interface StoredUserProfile {
  readonly currentStreak: number;
  readonly bestStreak: number;
  readonly lastDailyDateKey: string | null;
  readonly totalDailySolves: number;
  readonly perfectCount: number;
}

export const EMPTY_USER_PROFILE: StoredUserProfile = {
  currentStreak: 0,
  bestStreak: 0,
  lastDailyDateKey: null,
  totalDailySolves: 0,
  perfectCount: 0,
};

const VALID_MODES = new Set<GameMode>([
  'daily',
  'bonus-1',
  'bonus-2',
  'practice',
  'zen',
]);

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Returns YYYY-MM-DD for the UTC day immediately preceding `dateKey` */
export function getPreviousUtcDateKey(dateKey: string): string {
  const ms = Date.parse(`${dateKey}T00:00:00Z`);
  if (!Number.isFinite(ms)) return dateKey;
  return new Date(ms - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Pure UTC streak state machine.
 * Strictly counts ONLY Main Daily completions (`mode === 'daily'`).
 */
export function evaluateDailyStreakUpdate(
  prev: StoredUserProfile,
  mode: GameMode,
  completedDateKey: string,
  newlyEarnedPerfect: boolean
): {
  nextProfile: StoredUserProfile;
  isFirstSolveToday: boolean;
} {
  const nextPerfectCount =
    prev.perfectCount + (newlyEarnedPerfect ? 1 : 0);

  if (mode !== 'daily') {
    return {
      nextProfile: {
        ...prev,
        perfectCount: nextPerfectCount,
      },
      isFirstSolveToday: false,
    };
  }

  // Idempotent same-day replay: never double-increment streak or daily solve count
  if (prev.lastDailyDateKey === completedDateKey) {
    return {
      nextProfile: {
        ...prev,
        perfectCount: nextPerfectCount,
      },
      isFirstSolveToday: false,
    };
  }

  const yesterdayKey = getPreviousUtcDateKey(completedDateKey);
  const nextStreak =
    prev.lastDailyDateKey === yesterdayKey ? prev.currentStreak + 1 : 1;
  const nextBestStreak = Math.max(prev.bestStreak, nextStreak);

  return {
    nextProfile: {
      currentStreak: nextStreak,
      bestStreak: nextBestStreak,
      lastDailyDateKey: completedDateKey,
      totalDailySolves: prev.totalDailySolves + 1,
      perfectCount: nextPerfectCount,
    },
    isFirstSolveToday: true,
  };
}

/**
 * Converts a 0-based ascending Redis ZRANK into a 1-based descending rank (#1 = best)
 * and top-percentile integer in [1, 100].
 */
export function computeRankAndPercentile(
  ascendingZeroBasedRank: number | undefined | null,
  totalPlayers: number
): { personalRank: number | null; percentile: number | null } {
  if (
    ascendingZeroBasedRank === undefined ||
    ascendingZeroBasedRank === null ||
    ascendingZeroBasedRank < 0 ||
    totalPlayers <= 0
  ) {
    return { personalRank: null, percentile: null };
  }

  const personalRank = Math.max(1, totalPlayers - ascendingZeroBasedRank);
  if (personalRank === 1) {
    return { personalRank: 1, percentile: 1 };
  }

  const rawPct = (personalRank / totalPlayers) * 100;
  const percentile = Math.max(1, Math.min(100, Math.ceil(rawPct)));

  return { personalRank, percentile };
}

/**
 * Merges a new completion with an existing per-seed record, preserving best score,
 * fastest time, fewest moves, and permanent Pale Jade status.
 */
export function mergeSealRecord(
  existing: PersistedSealRecord | null,
  incoming: PersistedSealRecord
): { merged: PersistedSealRecord; newlyEarnedPerfect: boolean } {
  if (!existing) {
    return {
      merged: incoming,
      newlyEarnedPerfect: incoming.isPerfect,
    };
  }

  const newlyEarnedPerfect = !existing.isPerfect && incoming.isPerfect;

  const merged: PersistedSealRecord = {
    seed: existing.seed,
    mode: existing.mode,
    edition: existing.edition,
    name: incoming.name || existing.name,
    silhouettePathD: incoming.silhouettePathD || existing.silhouettePathD,
    isPerfect: existing.isPerfect || incoming.isPerfect,
    bestScore: Math.max(existing.bestScore, incoming.bestScore),
    bestMoves: Math.min(existing.bestMoves, incoming.bestMoves),
    bestElapsedMs:
      existing.bestElapsedMs > 0 && incoming.bestElapsedMs > 0
        ? Math.min(existing.bestElapsedMs, incoming.bestElapsedMs)
        : Math.max(existing.bestElapsedMs, incoming.bestElapsedMs),
    completedAtIso: existing.completedAtIso,
  };

  return { merged, newlyEarnedPerfect };
}

/**
 * Validates untrusted client completion payloads for structural integrity
 * and physical human plausibility before computing server-side scores.
 */
export function validateCompletionSubmission(
  payload: unknown
): { ok: true; value: CompletePuzzleRequest } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Invalid JSON request body.' };
  }

  const p = payload as Record<string, unknown>;
  const mode = p.mode as GameMode;

  if (!VALID_MODES.has(mode)) {
    return { ok: false, error: 'Invalid game mode.' };
  }

  if (typeof p.seed !== 'string' || p.seed.length < 4 || p.seed.length > 120) {
    return { ok: false, error: 'Invalid puzzle seed.' };
  }

  if (
    mode === 'daily' &&
    (typeof p.dateKey !== 'string' || !DATE_KEY_REGEX.test(p.dateKey))
  ) {
    return { ok: false, error: 'Invalid UTC dateKey for daily mode.' };
  }

  const pieceCount = Number(p.pieceCount);
  if (!Number.isInteger(pieceCount) || pieceCount < 6 || pieceCount > 9) {
    return { ok: false, error: 'Piece count must be an integer between 6 and 9.' };
  }

  const moves = Number(p.moves);
  const parMoves = Number(p.parMoves);
  if (
    !Number.isInteger(moves) ||
    moves < pieceCount ||
    moves > 2_000 ||
    !Number.isInteger(parMoves) ||
    parMoves < pieceCount ||
    parMoves > 200
  ) {
    return {
      ok: false,
      error: 'Move count outside physically valid puzzle bounds.',
    };
  }

  const elapsedMs = Number(p.elapsedMs);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 86_400_000) {
    return { ok: false, error: 'Invalid elapsed duration.' };
  }

  // Timed competitive modes require at least 1.5s to physically drag 6+ pieces
  if (mode !== 'zen' && elapsedMs < 1_500) {
    return {
      ok: false,
      error: 'Completion duration below minimum physical threshold.',
    };
  }

  const edition = Number(p.edition);
  if (!Number.isInteger(edition) || edition < 1 || edition > 100_000) {
    return { ok: false, error: 'Invalid edition number.' };
  }

  const sigilName =
    typeof p.sigilName === 'string'
      ? p.sigilName.trim().slice(0, 80)
      : 'Sigil';
  const silhouettePathD =
    typeof p.silhouettePathD === 'string'
      ? p.silhouettePathD.slice(0, 6_000)
      : '';

  if (!silhouettePathD.startsWith('M ')) {
    return { ok: false, error: 'Invalid Sigil SVG path geometry.' };
  }

  return {
    ok: true,
    value: {
      mode,
      dateKey: typeof p.dateKey === 'string' ? p.dateKey.slice(0, 32) : '',
      edition,
      seed: p.seed,
      sigilName,
      silhouettePathD,
      pieceCount,
      moves,
      parMoves,
      elapsedMs: Math.round(elapsedMs),
    },
  };
}