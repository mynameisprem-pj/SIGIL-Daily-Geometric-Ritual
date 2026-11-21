import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compilePieceBlueprint,
  computeTrueGeometricCentroid,
  createScatteredPieceStates,
  distanceBetween,
  shortestAngleDistanceDeg,
} from './geometry';
import { PROTOTYPE_SIGILS } from './prototypeSigils';
import {
  computeCompletionStats,
  evaluatePieceSnap,
  getOccupiedSlotIds,
  rotateAngleByStep,
} from './solver';

void describe('True Geometric Centroid Calculation', () => {
  void it('computes length-weighted centroid rather than bounding-box center for an asymmetric L-shape', () => {
    // Horizontal arm length 100 from (0,0)->(100,0): midpoint (50, 0), weight 100
    // Vertical arm length 200 from (0,0)->(0,200): midpoint (0, 100), weight 200
    // Bounding box center would be (50, 100).
    // True length-weighted centroid = ((100*50 + 200*0)/300, (100*0 + 200*100)/300) = (16.667, 66.667)
    const { centroid, totalLength } = computeTrueGeometricCentroid([
      {
        kind: 'polyline',
        points: [
          { x: 100, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 200 },
        ],
      },
    ]);

    assert.ok(Math.abs(totalLength - 300) < 1e-6);
    assert.ok(
      Math.abs(centroid.x - 50 / 3) < 1e-4,
      `Expected centroid.x ~16.6667, got ${centroid.x}`
    );
    assert.ok(
      Math.abs(centroid.y - 200 / 3) < 1e-4,
      `Expected centroid.y ~66.6667, got ${centroid.y}`
    );
    // Explicitly verify it differs strongly from bounding box center (50, 100)
    assert.ok(Math.abs(centroid.x - 50) > 30);
  });

  void it('computes exact wire centroid of a semicircular arc', () => {
    // Semicircle R=100 from -90 deg to +90 deg (eastward bulge around (0,0)):
    // Analytical wire centroid x = 2 * R / pi = 200 / pi ≈ 63.662, y = 0
    // (Bounding-box center would have been x = 50)
    const { centroid } = computeTrueGeometricCentroid([
      {
        kind: 'arc',
        center: { x: 0, y: 0 },
        radius: 100,
        startAngleDeg: -90,
        sweepAngleDeg: 180,
      },
    ]);

    const expectedX = 200 / Math.PI;
    assert.ok(
      Math.abs(centroid.x - expectedX) < 1e-3,
      `Expected arc centroid.x=${expectedX}, got ${centroid.x}`
    );
    assert.ok(Math.abs(centroid.y) < 1e-4);
  });
});

void describe('Visible-Geometry Rotational Symmetry Detection', () => {
  void it('detects 2-fold [0, 180] symmetry on a straight cross-bar piece', () => {
    const bar = compilePieceBlueprint({
      id: 'bar-2fold',
      primitives: [
        { kind: 'line', from: { x: 200, y: 260 }, to: { x: 320, y: 260 } },
      ],
    });
    assert.deepEqual(bar.selfSymmetryAnglesDeg, [0, 180]);
  });

  void it('detects 4-fold [0, 90, 180, 270] symmetry on a diamond/square piece', () => {
    const compass = PROTOTYPE_SIGILS[0]!;
    const diamond = compass.pieces.find((p) => p.id === 'core-diamond')!;
    assert.deepEqual(diamond.selfSymmetryAnglesDeg, [0, 90, 180, 270]);
  });

  void it('detects strict [0] asymmetry on a hooked rune piece', () => {
    const astrolabe = PROTOTYPE_SIGILS[1]!;
    const nadirAnchor = astrolabe.pieces.find((p) => p.id === 'nadir-anchor')!;
    assert.deepEqual(nadirAnchor.selfSymmetryAnglesDeg, [0]);
  });
});

void describe('Rotation Stepping & ~5 Degree Angular Snap Tolerance', () => {
  void it('wraps 45-degree clockwise and counter-clockwise steps cleanly across 0/360', () => {
    assert.equal(rotateAngleByStep(315, 1), 0);
    assert.equal(rotateAngleByStep(0, -1), 315);
    assert.equal(rotateAngleByStep(45, 1), 90);
  });

  void it('snaps within <= 5 deg angular tolerance (including 356 deg -> 0 deg wrap) and rejects > 5 deg', () => {
    const compass = PROTOTYPE_SIGILS[0]!;
    const spear = compass.pieces.find((p) => p.id === 'north-spear')!;
    const emptyOccupied = new Set<string>();

    // Near-perfect 355.5 deg (4.5 deg from 0) + 12px position offset -> MUST SNAP to exact 0 deg
    const nearZeroWrap = evaluatePieceSnap(
      spear,
      { x: spear.targetCentroid.x + 12, y: spear.targetCentroid.y - 8 },
      355.5,
      compass,
      emptyOccupied
    );
    assert.equal(nearZeroWrap.matched, true);
    assert.equal(nearZeroWrap.snappedRotationDeg, 0);
    assert.deepEqual(nearZeroWrap.snappedPosition, spear.targetCentroid);

    // 7.5 deg off -> MUST NOT SNAP (exceeds 5 deg tolerance)
    const tooTilted = evaluatePieceSnap(
      spear,
      spear.targetCentroid,
      7.5,
      compass,
      emptyOccupied
    );
    assert.equal(tooTilted.matched, false);

    // 26px away -> MUST NOT SNAP (exceeds 20px position tolerance)
    const tooFar = evaluatePieceSnap(
      spear,
      { x: spear.targetCentroid.x + 26, y: spear.targetCentroid.y },
      0,
      compass,
      emptyOccupied
    );
    assert.equal(tooFar.matched, false);
  });

  void it('allows congruent wings to snap into each other’s slots when rotated to match visible world geometry', () => {
    const astrolabe = PROTOTYPE_SIGILS[1]!;
    const westWing = astrolabe.pieces.find((p) => p.id === 'west-wing')!;
    const eastWing = astrolabe.pieces.find((p) => p.id === 'east-wing')!;

    // Place westWing onto eastWing's target centroid rotated by 180 deg!
    const crossSnap = evaluatePieceSnap(
      westWing,
      eastWing.targetCentroid,
      180,
      astrolabe,
      new Set<string>()
    );
    assert.equal(crossSnap.matched, true);
    assert.equal(crossSnap.targetSlotId, 'east-wing');
    assert.equal(crossSnap.snappedRotationDeg, 180);

    // Once east-wing slot is occupied, a second piece cannot double-snap into east-wing
    const blockedSnap = evaluatePieceSnap(
      eastWing,
      eastWing.targetCentroid,
      0,
      astrolabe,
      new Set<string>(['east-wing'])
    );
    assert.equal(blockedSnap.matched, false);
  });
});

void describe('Deterministic Scatter & Full Puzzle Completion Lifecycle', () => {
  void it('scatters all pieces outside snap zones and completes cleanly when all pieces lock', () => {
    const puzzle = PROTOTYPE_SIGILS[1]!; // Solar Astrolabe (7 pieces)
    let states = createScatteredPieceStates(puzzle, '2026-11-21:daily');

    assert.equal(states.length, 7);

    // Verify no piece starts pre-solved or inside snap zone
    for (const st of states) {
      const def = puzzle.pieces.find((p) => p.id === st.id)!;
      assert.equal(st.locked, false);
      assert.ok(distanceBetween(st.position, def.targetCentroid) > 20);
      for (const sym of def.selfSymmetryAnglesDeg) {
        assert.ok(shortestAngleDistanceDeg(st.rotationDeg, sym) > 5);
      }
    }

    // Simulate solving every piece one by one
    let moves = 0;
    states = states.map((st) => {
      const def = puzzle.pieces.find((p) => p.id === st.id)!;
      const occupied = getOccupiedSlotIds(states, st.id);
      // Use a valid symmetric rotation (180 deg if available, else 0 deg)
      const validRot =
        def.selfSymmetryAnglesDeg.length > 1
          ? def.selfSymmetryAnglesDeg[1]!
          : 0;
      const snap = evaluatePieceSnap(
        def,
        def.targetCentroid,
        validRot,
        puzzle,
        occupied
      );
      assert.equal(snap.matched, true, `Piece ${st.id} failed to snap`);
      moves += st.parMoves;
      return {
        ...st,
        position: snap.snappedPosition!,
        rotationDeg: snap.snappedRotationDeg!,
        locked: true,
        lockedSlotId: snap.targetSlotId,
      };
    });

    const completion = computeCompletionStats(states, moves, 18_400);
    assert.equal(completion.isComplete, true);
    assert.equal(completion.lockedCount, 7);
    assert.equal(completion.isPerfect, true);
  });
});