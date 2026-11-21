import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateSigilScore,
  decodeLeaderboardTotalScore,
  encodeLeaderboardCompositeScore,
} from './scoring';

void describe('Shared Sigil Combined Scoring Engine', () => {
  void it('awards maximum 1100 score and Grand Lapidary grade on fast Perfect Reconstruction', () => {
    const result = calculateSigilScore({
      moves: 14,
      parMoves: 13, // within +2 perfect buffer
      elapsedMs: 28_000, // faster than 6 * 6000 = 36s par
      pieceCount: 6,
    });

    assert.equal(result.isPerfect, true);
    assert.equal(result.moveScore, 300);
    assert.equal(result.speedScore, 200);
    assert.equal(result.perfectBonus, 100);
    assert.equal(result.totalScore, 1100);
    assert.equal(result.grade, 'grand-lapidary');
  });

  void it('penalizes excess moves and overtime smoothly without dropping below base 500', () => {
    const mid = calculateSigilScore({
      moves: 25,
      parMoves: 14, // threshold = 16 -> 9 excess moves (-108 pts -> 192)
      elapsedMs: 132_000, // par = 42s -> 90s overtime (50% of 180s window -> 100 speed pts)
      pieceCount: 7,
    });

    assert.equal(mid.isPerfect, false);
    assert.equal(mid.perfectBonus, 0);
    assert.equal(mid.moveScore, 192);
    assert.equal(mid.speedScore, 100);
    assert.equal(mid.totalScore, 792);
    assert.equal(mid.grade, 'adept-wayfinder');

    const floorCase = calculateSigilScore({
      moves: 200,
      parMoves: 12,
      elapsedMs: 900_000,
      pieceCount: 6,
    });
    assert.equal(floorCase.totalScore, 500);
    assert.equal(floorCase.grade, 'stone-initiate');
  });

  void it('breaks ties in favor of faster elapsedMs in Redis composite score encoding', () => {
    const faster = encodeLeaderboardCompositeScore(950, 31_200);
    const slower = encodeLeaderboardCompositeScore(950, 44_800);
    const higherScore = encodeLeaderboardCompositeScore(962, 70_000);

    assert.ok(faster > slower);
    assert.ok(higherScore > faster);
    assert.equal(decodeLeaderboardTotalScore(faster), 950);
    assert.equal(decodeLeaderboardTotalScore(higherScore), 962);
  });
});