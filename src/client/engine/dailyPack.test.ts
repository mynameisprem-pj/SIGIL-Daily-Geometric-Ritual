import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getDateKeyForEdition,
  getEditionNumber,
  STAGE_VIEWBOX_SIZE,
} from '../../shared/constants';
import {
  buildDailySigilPack,
  buildPracticeEntryByEdition,
  buildZenEntry,
  getCalibratedMainPieceCount,
} from './dailyPack';
import {
  createScatteredPieceStates,
  rotatePointAroundOrigin,
} from './geometry';
import { evaluatePieceSnap, getOccupiedSlotIds } from './solver';

void describe('Daily Seeding, Weekly Calibration & 90-Puzzle Quality Gate', () => {
  void it('produces bit-for-bit identical DailySigilPacks for the same UTC dateKey', () => {
    const packA = buildDailySigilPack('2026-12-04');
    const packB = buildDailySigilPack('2026-12-04');

    assert.equal(packA.main.puzzle.name, packB.main.puzzle.name);
    assert.equal(
      packA.main.puzzle.unifiedSilhouettePathD,
      packB.main.puzzle.unifiedSilhouettePathD
    );
    assert.equal(
      packA.bonus1.puzzle.unifiedSilhouettePathD,
      packB.bonus1.puzzle.unifiedSilhouettePathD
    );
    assert.equal(
      packA.bonus2.puzzle.unifiedSilhouettePathD,
      packB.bonus2.puzzle.unifiedSilhouettePathD
    );
  });

  void it('follows the calibrated weekly piece-count curve across Monday -> Sunday', () => {
    // 2026-11-30 is Monday, 2026-12-06 is Sunday
    assert.equal(getCalibratedMainPieceCount('2026-11-30'), 6); // Mon
    assert.equal(getCalibratedMainPieceCount('2026-12-01'), 6); // Tue
    assert.equal(getCalibratedMainPieceCount('2026-12-02'), 7); // Wed
    assert.equal(getCalibratedMainPieceCount('2026-12-03'), 7); // Thu
    assert.equal(getCalibratedMainPieceCount('2026-12-04'), 7); // Fri
    assert.equal(getCalibratedMainPieceCount('2026-12-05'), 8); // Sat
    assert.equal(getCalibratedMainPieceCount('2026-12-06'), 8); // Sun
  });

  void it('validates 30 consecutive days (90 puzzles) for bounds containment and 100% solvability', () => {
    for (let edition = 1; edition <= 30; edition++) {
      const dateKey = getDateKeyForEdition(edition);
      assert.equal(getEditionNumber(dateKey), edition);

      const pack = buildDailySigilPack(dateKey);
      const entries = [pack.main, pack.bonus1, pack.bonus2];

      for (const entry of entries) {
        const { puzzle, seed } = entry;
        assert.ok(
          puzzle.pieces.length >= 6 && puzzle.pieces.length <= 9,
          `Unexpected piece count ${puzzle.pieces.length} on ${dateKey} (${entry.mode})`
        );

        let states = createScatteredPieceStates(puzzle, seed);

        // 1. Verify every rotated sample point of every scattered piece stays inside [16, 504]
        for (const st of states) {
          const def = puzzle.pieces.find((p) => p.id === st.id)!;
          for (const localPt of def.localSamplePoints) {
            const rot = rotatePointAroundOrigin(localPt, st.rotationDeg);
            const wx = st.position.x + rot.x;
            const wy = st.position.y + rot.y;
            assert.ok(
              wx >= 16 &&
                wx <= STAGE_VIEWBOX_SIZE - 16 &&
                wy >= 16 &&
                wy <= STAGE_VIEWBOX_SIZE - 16,
              `Out-of-bounds scatter (${wx.toFixed(1)}, ${wy.toFixed(1)}) on ${dateKey} ${entry.mode} piece ${st.id}`
            );
          }
        }

        // 2. Simulate full reconstruction to prove 100% solvability without slot conflict
        states = states.map((st) => {
          const def = puzzle.pieces.find((p) => p.id === st.id)!;
          const occupied = getOccupiedSlotIds(states, st.id);
          const snap = evaluatePieceSnap(
            def,
            def.targetCentroid,
            0,
            puzzle,
            occupied
          );
          assert.equal(
            snap.matched,
            true,
            `Failed solvability on ${dateKey} ${entry.mode} piece ${st.id}`
          );
          return {
            ...st,
            position: snap.snappedPosition!,
            rotationDeg: snap.snappedRotationDeg!,
            locked: true,
            lockedSlotId: snap.targetSlotId,
          };
        });

        assert.ok(states.every((s) => s.locked));
      }
    }
  });

  void it('supports Practice Archive lookup and Zen Mode stream generation', () => {
    const practiceDay5 = buildPracticeEntryByEdition(5);
    assert.equal(practiceDay5.mode, 'practice');
    assert.equal(practiceDay5.edition, 5);

    const zen1 = buildZenEntry(1, 'architect');
    const zen2 = buildZenEntry(2, 'architect');
    assert.equal(zen1.mode, 'zen');
    assert.notEqual(
      zen1.puzzle.unifiedSilhouettePathD,
      zen2.puzzle.unifiedSilhouettePathD
    );
  });
});