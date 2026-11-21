import {
  GEOMETRY_CONGRUENCE_EPSILON_PX,
  ROTATION_STEP_DEG,
  SNAP_ANGLE_TOLERANCE_DEG,
  SNAP_DISTANCE_PX,
} from '../../shared/constants';
import type {
  CompiledSigilPuzzle,
  NormalizedPieceDefinition,
  PieceRuntimeState,
  Point2D,
  PuzzleCompletionStats,
  SnapEvaluation,
} from '../../shared/types';
import {
  computeBidirectionalMaxDeviation,
  distanceBetween,
  normalizeAngleDeg,
  shortestAngleDistanceDeg,
  transformLocalPointsToWorld,
} from './geometry';

/**
 * Evaluates whether `piece` at `(candidatePosition, candidateRotationDeg)` can snap
 * into any currently unoccupied canonical slot in `puzzle`.
 *
 * Enforces all three gates:
 *  1. Centroid distance <= SNAP_DISTANCE_PX (20px)
 *  2. Angular error <= SNAP_ANGLE_TOLERANCE_DEG (~5 deg) against a discrete candidate angle
 *  3. Complete visible world-space geometry congruence (bidirectional Hausdorff <= 1.25px)
 */
export function evaluatePieceSnap(
  piece: NormalizedPieceDefinition,
  candidatePosition: Point2D,
  candidateRotationDeg: number,
  puzzle: CompiledSigilPuzzle,
  occupiedSlotIds: ReadonlySet<string>,
  options?: {
    snapDistancePx?: number;
    angleToleranceDeg?: number;
    geometryEpsilonPx?: number;
  }
): SnapEvaluation {
  const maxDist = options?.snapDistancePx ?? SNAP_DISTANCE_PX;
  const maxAngleErr = options?.angleToleranceDeg ?? SNAP_ANGLE_TOLERANCE_DEG;
  const geomEpsilon =
    options?.geometryEpsilonPx ?? GEOMETRY_CONGRUENCE_EPSILON_PX;

  const normalizedInputAngle = normalizeAngleDeg(candidateRotationDeg);

  // Build candidate exact snap angles within +/- maxAngleErr of candidateRotationDeg.
  // We test 15-deg lattice multiples + piece's exact self-symmetry angles so both 45-deg
  // gameplay and 60/120-deg symmetric runes snap to crisp mathematical angles.
  const exactAnglePool = new Set<number>();
  for (let a = 0; a < 360; a += 15) exactAnglePool.add(a);
  for (const sym of piece.selfSymmetryAnglesDeg) {
    exactAnglePool.add(normalizeAngleDeg(sym));
  }

  const nearbyAngles = [...exactAnglePool]
    .map((exactDeg) => ({
      exactDeg,
      angleErr: shortestAngleDistanceDeg(normalizedInputAngle, exactDeg),
    }))
    .filter((entry) => entry.angleErr <= maxAngleErr)
    .sort((a, b) => a.angleErr - b.angleErr);

  let bestRejectDist = Infinity;
  let bestRejectAngle = Infinity;
  let bestRejectGeom = Infinity;

  // Sort unoccupied slots by proximity to candidatePosition
  const candidateSlots = puzzle.pieces
    .filter((slot) => !occupiedSlotIds.has(slot.id))
    .map((slot) => ({
      slot,
      dist: distanceBetween(candidatePosition, slot.targetCentroid),
    }))
    .sort((a, b) => a.dist - b.dist);

  for (const { slot, dist } of candidateSlots) {
    if (dist < bestRejectDist) bestRejectDist = dist;
    if (dist > maxDist) continue;

    // Quick length sanity check before point-cloud comparison
    if (Math.abs(piece.totalLength - slot.totalLength) > geomEpsilon * 4) {
      continue;
    }

    for (const { exactDeg, angleErr } of nearbyAngles) {
      if (angleErr < bestRejectAngle) bestRejectAngle = angleErr;

      const worldTransformed = transformLocalPointsToWorld(
        piece.localSamplePoints,
        slot.targetCentroid,
        exactDeg
      );

      const geomDeviation = computeBidirectionalMaxDeviation(
        worldTransformed,
        slot.worldSamplePoints,
        geomEpsilon
      );

      if (geomDeviation < bestRejectGeom) bestRejectGeom = geomDeviation;

      if (geomDeviation <= geomEpsilon) {
        return {
          matched: true,
          targetSlotId: slot.id,
          snappedPosition: slot.targetCentroid,
          snappedRotationDeg: exactDeg,
          distanceErrorPx: dist,
          angleErrorDeg: angleErr,
          geometryDeviationPx: geomDeviation,
        };
      }
    }
  }

  return {
    matched: false,
    targetSlotId: null,
    snappedPosition: null,
    snappedRotationDeg: null,
    distanceErrorPx: bestRejectDist,
    angleErrorDeg: bestRejectAngle,
    geometryDeviationPx: bestRejectGeom,
  };
}

export function getOccupiedSlotIds(
  states: readonly PieceRuntimeState[],
  excludePieceId?: string
): Set<string> {
  const occupied = new Set<string>();
  for (const st of states) {
    if (st.id !== excludePieceId && st.locked && st.lockedSlotId) {
      occupied.add(st.lockedSlotId);
    }
  }
  return occupied;
}

export function rotateAngleByStep(
  currentDeg: number,
  direction: 1 | -1 = 1,
  stepDeg: number = ROTATION_STEP_DEG
): number {
  const stepped =
    Math.round(currentDeg / stepDeg) * stepDeg + direction * stepDeg;
  return normalizeAngleDeg(stepped);
}

export function computeCompletionStats(
  states: readonly PieceRuntimeState[],
  moves: number,
  elapsedMs: number
): PuzzleCompletionStats {
  const totalCount = states.length;
  let lockedCount = 0;
  let parMoves = 0;

  for (const st of states) {
    if (st.locked) lockedCount++;
    parMoves += st.parMoves;
  }

  const isComplete = totalCount > 0 && lockedCount === totalCount;
  // Allow a tight +2 buffer on parMoves for "Perfect" mastery so natural micro-adjustments still reward clean solves
  const isPerfect = isComplete && moves <= parMoves + 2;

  return {
    isComplete,
    lockedCount,
    totalCount,
    moves,
    parMoves,
    isPerfect,
    elapsedMs,
  };
}