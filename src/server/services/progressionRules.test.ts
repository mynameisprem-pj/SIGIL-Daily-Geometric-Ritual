import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PersistedSealRecord } from '../../shared/types';
import {
  computeRankAndPercentile,
  EMPTY_USER_PROFILE,
  evaluateDailyStreakUpdate,
  mergeSealRecord,
  validateCompletionSubmission,
} from './progressionRules';

void describe('UTC Daily Streak State Machine', () => {
  void it('increments streak on consecutive UTC days, stays idempotent on same-day replays, and resets after a gap', () => {
    // Day 1: First ever Main Daily solve
    const day1 = evaluateDailyStreakUpdate(
      EMPTY_USER_PROFILE,
      'daily',
      '2026-11-21',
      true
    );
    assert.equal(day1.isFirstSolveToday, true);
    assert.equal(day1.nextProfile.currentStreak, 1);
    assert.equal(day1.nextProfile.bestStreak, 1);
    assert.equal(day1.nextProfile.perfectCount, 1);

    // Day 1 replay: Must NOT increment streak or totalDailySolves
    const day1Replay = evaluateDailyStreakUpdate(
      day1.nextProfile,
      'daily',
      '2026-11-21',
      false
    );
    assert.equal(day1Replay.isFirstSolveToday, false);
    assert.equal(day1Replay.nextProfile.currentStreak, 1);
    assert.equal(day1Replay.nextProfile.totalDailySolves, 1);

    // Day 2 (consecutive): Increments to 2
    const day2 = evaluateDailyStreakUpdate(
      day1Replay.nextProfile,
      'daily',
      '2026-11-22',
      false
    );
    assert.equal(day2.isFirstSolveToday, true);
    assert.equal(day2.nextProfile.currentStreak, 2);
    assert.equal(day2.nextProfile.bestStreak, 2);

    // Bonus / Zen modes NEVER advance daily streak
    const bonusSolve = evaluateDailyStreakUpdate(
      day2.nextProfile,
      'bonus-1',
      '2026-11-23',
      true
    );
    assert.equal(bonusSolve.isFirstSolveToday, false);
    assert.equal(bonusSolve.nextProfile.currentStreak, 2);
    assert.equal(bonusSolve.nextProfile.lastDailyDateKey, '2026-11-22');
    assert.equal(bonusSolve.nextProfile.perfectCount, 2);

    // Day 5 (missed Nov 23 & 24): Streak resets to 1, bestStreak remains 2
    const afterGap = evaluateDailyStreakUpdate(
      bonusSolve.nextProfile,
      'daily',
      '2026-11-25',
      false
    );
    assert.equal(afterGap.nextProfile.currentStreak, 1);
    assert.equal(afterGap.nextProfile.bestStreak, 2);
  });
});

void describe('Leaderboard Rank & Top Percentile Calculation', () => {
  void it('computes 1-based descending rank and ceiling top-percentile accurately', () => {
    // Highest scorer in 100 players has ascending ZRANK = 99 -> Rank #1, Top 1%
    assert.deepEqual(computeRankAndPercentile(99, 100), {
      personalRank: 1,
      percentile: 1,
    });

    // 95th ascending out of 100 -> Rank #5, Top 5%
    assert.deepEqual(computeRankAndPercentile(95, 100), {
      personalRank: 5,
      percentile: 5,
    });

    // First solver of the day (ascending ZRANK = 0 out of 1) -> Rank #1, Top 1%
    assert.deepEqual(computeRankAndPercentile(0, 1), {
      personalRank: 1,
      percentile: 1,
    });

    // Unranked player -> nulls
    assert.deepEqual(computeRankAndPercentile(undefined, 25), {
      personalRank: null,
      percentile: null,
    });
  });
});

void describe('Seal Record Merging & Submission Plausibility Validation', () => {
  void it('preserves permanent Pale Jade status even if a later replay has lower score', () => {
    const first: PersistedSealRecord = {
      seed: 'sigil:v1:2026-11-21:daily',
      mode: 'daily',
      edition: 1,
      name: 'Valkyrie Compass',
      silhouettePathD: 'M 0 0 L 10 10',
      isPerfect: true,
      bestScore: 1080,
      bestMoves: 12,
      bestElapsedMs: 31_000,
      completedAtIso: '2026-11-21T08:00:00.000Z',
    };

    const slowerReplay: PersistedSealRecord = {
      ...first,
      isPerfect: false,
      bestScore: 760,
      bestMoves: 22,
      bestElapsedMs: 65_000,
    };

    const { merged, newlyEarnedPerfect } = mergeSealRecord(first, slowerReplay);
    assert.equal(merged.isPerfect, true);
    assert.equal(merged.bestScore, 1080);
    assert.equal(merged.bestMoves, 12);
    assert.equal(newlyEarnedPerfect, false);
  });

  void it('rejects physically impossible move counts and sub-1.5s timed completions', () => {
    const tooFewMoves = validateCompletionSubmission({
      mode: 'daily',
      dateKey: '2026-11-21',
      edition: 1,
      seed: 'sigil:v1:2026-11-21:daily',
      sigilName: 'Valkyrie Compass',
      silhouettePathD: 'M 260 140 L 260 320',
      pieceCount: 6,
      moves: 3, // Impossible to place 6 pieces in 3 moves
      parMoves: 12,
      elapsedMs: 25_000,
    });
    assert.equal(tooFewMoves.ok, false);

    const inhumanSpeed = validateCompletionSubmission({
      mode: 'daily',
      dateKey: '2026-11-21',
      edition: 1,
      seed: 'sigil:v1:2026-11-21:daily',
      sigilName: 'Valkyrie Compass',
      silhouettePathD: 'M 260 140 L 260 320',
      pieceCount: 6,
      moves: 12,
      parMoves: 12,
      elapsedMs: 400, // 0.4s bot submission
    });
    assert.equal(inhumanSpeed.ok, false);

    const validDaily = validateCompletionSubmission({
      mode: 'daily',
      dateKey: '2026-11-21',
      edition: 1,
      seed: 'sigil:v1:2026-11-21:daily',
      sigilName: 'Valkyrie Compass',
      silhouettePathD: 'M 260 140 L 260 320',
      pieceCount: 6,
      moves: 13,
      parMoves: 12,
      elapsedMs: 28_500,
    });
    assert.equal(validDaily.ok, true);
  });
});