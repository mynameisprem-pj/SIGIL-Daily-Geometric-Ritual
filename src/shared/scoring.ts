import type { MasteryGrade, ScoreBreakdown } from './types';

export interface ScoreInput {
  readonly moves: number;
  readonly parMoves: number;
  readonly elapsedMs: number;
  readonly pieceCount: number;
}

export const BASE_COMPLETION_SCORE = 500;
export const MAX_MOVE_EFFICIENCY_SCORE = 300;
export const MAX_SPEED_SCORE = 200;
export const PERFECT_MASTERY_BONUS = 100;
export const PERFECT_MOVE_BUFFER = 2;
export const MOVE_PENALTY_PER_EXCESS = 12;

/** Target par solve pace: 6 seconds per piece (e.g. 36s for 6p, 48s for 8p) */
export const PAR_MS_PER_PIECE = 6_000;
/** Speed bonus tapers smoothly to 0 at parTime + 180s */
export const SPEED_TAPER_WINDOW_MS = 180_000;

function resolveGrade(totalScore: number, isPerfect: boolean): {
  grade: MasteryGrade;
  gradeLabel: string;
} {
  if (isPerfect) {
    return { grade: 'grand-lapidary', gradeLabel: 'Grand Lapidary' };
  }
  if (totalScore >= 880) {
    return { grade: 'master-engraver', gradeLabel: 'Master Engraver' };
  }
  if (totalScore >= 720) {
    return { grade: 'adept-wayfinder', gradeLabel: 'Adept Wayfinder' };
  }
  return { grade: 'stone-initiate', gradeLabel: 'Stone Initiate' };
}

/**
 * Pure, deterministic combined score calculation shared between client UI and Hono server.
 */
export function calculateSigilScore(input: ScoreInput): ScoreBreakdown {
  const safeMoves = Math.max(1, Math.floor(input.moves));
  const safeParMoves = Math.max(1, Math.floor(input.parMoves));
  const safeElapsedMs = Math.max(0, Math.round(input.elapsedMs));
  const safePieces = Math.max(1, Math.floor(input.pieceCount));

  const perfectThreshold = safeParMoves + PERFECT_MOVE_BUFFER;
  const excessMoves = Math.max(0, safeMoves - perfectThreshold);
  const isPerfect = excessMoves === 0;

  const moveScore = Math.max(
    0,
    MAX_MOVE_EFFICIENCY_SCORE - excessMoves * MOVE_PENALTY_PER_EXCESS
  );

  const parTimeMs = safePieces * PAR_MS_PER_PIECE;
  let speedScore = MAX_SPEED_SCORE;
  if (safeElapsedMs > parTimeMs) {
    const overtimeMs = safeElapsedMs - parTimeMs;
    const ratio = Math.min(1, overtimeMs / SPEED_TAPER_WINDOW_MS);
    speedScore = Math.round(MAX_SPEED_SCORE * (1 - ratio));
  }

  const perfectBonus = isPerfect ? PERFECT_MASTERY_BONUS : 0;
  const totalScore =
    BASE_COMPLETION_SCORE + moveScore + speedScore + perfectBonus;

  const { grade, gradeLabel } = resolveGrade(totalScore, isPerfect);

  return {
    totalScore,
    baseScore: BASE_COMPLETION_SCORE,
    moveScore,
    speedScore,
    perfectBonus,
    excessMoves,
    parTimeMs,
    isPerfect,
    grade,
    gradeLabel,
  };
}

/**
 * Encodes totalScore + faster time tie-breaker into a single IEEE-754 safe integer
 * for Redis Sorted Sets (`ZADD`), so identical totalScores rank faster completions higher.
 */
export function encodeLeaderboardCompositeScore(
  totalScore: number,
  elapsedMs: number
): number {
  const clampedElapsed = Math.min(3_600_000, Math.max(0, Math.round(elapsedMs)));
  const speedTieBreaker = 3_600_000 - clampedElapsed;
  return totalScore * 10_000_000 + speedTieBreaker;
}

export function decodeLeaderboardTotalScore(compositeScore: number): number {
  return Math.floor(compositeScore / 10_000_000);
}