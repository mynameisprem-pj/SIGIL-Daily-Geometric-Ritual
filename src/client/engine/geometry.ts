import {
  GEOMETRY_CONGRUENCE_EPSILON_PX,
  ROTATION_STEP_DEG,
  SAMPLE_SPACING_PX,
  SANCTUM_CENTER,
  SCATTER_INNER_RADIUS,
  SCATTER_OUTER_RADIUS,
  SNAP_DISTANCE_PX,
  STAGE_PADDING_PX,
  STAGE_VIEWBOX_SIZE,
} from '../../shared/constants';
import type {
  CompiledSigilPuzzle,
  NormalizedPieceDefinition,
  PieceRuntimeState,
  Point2D,
  RawPieceBlueprint,
  RawSigilBlueprint,
  WorldStrokePrimitive,
} from '../../shared/types';
import { createSeededRng } from './prng';

const DEG_TO_RAD = Math.PI / 180;

export function degToRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

/** Normalizes any angle in degrees into [0, 360) */
export function normalizeAngleDeg(deg: number): number {
  const mod = deg % 360;
  const normalized = mod < 0 ? mod + 360 : mod;
  // Guard against IEEE-754 -0 or 359.99999999999994
  return Math.abs(normalized - 360) < 1e-9 || Math.abs(normalized) < 1e-9
    ? 0
    : normalized;
}

/** Shortest signed angular delta in (-180, 180] from `fromDeg` to `toDeg` */
export function shortestSignedAngleDeltaDeg(
  fromDeg: number,
  toDeg: number
): number {
  const diff = ((toDeg - fromDeg + 540) % 360) - 180;
  return diff === -180 ? 180 : diff;
}

/** Shortest unsigned angular distance in [0, 180] */
export function shortestAngleDistanceDeg(aDeg: number, bDeg: number): number {
  return Math.abs(shortestSignedAngleDeltaDeg(aDeg, bDeg));
}

export function distanceBetween(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function translatePoint(p: Point2D, dx: number, dy: number): Point2D {
  return { x: p.x + dx, y: p.y + dy };
}

export function rotatePointAroundOrigin(p: Point2D, angleDeg: number): Point2D {
  const rad = degToRad(angleDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  };
}

export function transformLocalPointsToWorld(
  localPoints: readonly Point2D[],
  worldOrigin: Point2D,
  rotationDeg: number
): Point2D[] {
  const rad = degToRad(rotationDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return localPoints.map((p) => ({
    x: worldOrigin.x + (p.x * cos - p.y * sin),
    y: worldOrigin.y + (p.x * sin + p.y * cos),
  }));
}

/** Polar helper in world coordinates around SANCTUM_CENTER (0 deg = East, -90/270 = North) */
export function polarPoint(
  radius: number,
  angleDeg: number,
  center: Point2D = { x: SANCTUM_CENTER, y: SANCTUM_CENTER }
): Point2D {
  const rad = degToRad(angleDeg);
  return {
    x: center.x + radius * Math.cos(rad),
    y: center.y + radius * Math.sin(rad),
  };
}

interface PrimitiveMassProperties {
  length: number;
  centroid: Point2D;
}

function lineSegmentMass(a: Point2D, b: Point2D): PrimitiveMassProperties {
  const length = distanceBetween(a, b);
  return {
    length,
    centroid: {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    },
  };
}

/**
 * Exact analytical arc length and wire centroid of a circular arc.
 * For a circular arc of radius R, central half-angle alpha = |sweep|/2 (in radians),
 * and bisector angle midRad:
 *   Centroid distance from arc center = R * sin(alpha) / alpha  (or 0 for full 360 circle).
 */
function circularArcMass(
  center: Point2D,
  radius: number,
  startAngleDeg: number,
  sweepAngleDeg: number
): PrimitiveMassProperties {
  const absSweepDeg = Math.min(360, Math.abs(sweepAngleDeg));
  const totalAngleRad = degToRad(absSweepDeg);
  const length = radius * totalAngleRad;

  if (absSweepDeg < 1e-6 || radius < 1e-6) {
    return {
      length: 0,
      centroid: polarPoint(radius, startAngleDeg, center),
    };
  }

  if (Math.abs(absSweepDeg - 360) < 1e-4) {
    return { length, centroid: center };
  }

  const halfAngleRad = totalAngleRad / 2;
  const midAngleRad = degToRad(startAngleDeg + sweepAngleDeg / 2);
  const radialOffset = (radius * Math.sin(halfAngleRad)) / halfAngleRad;

  return {
    length,
    centroid: {
      x: center.x + radialOffset * Math.cos(midAngleRad),
      y: center.y + radialOffset * Math.sin(midAngleRad),
    },
  };
}

function computePrimitiveMass(
  primitive: WorldStrokePrimitive
): PrimitiveMassProperties {
  switch (primitive.kind) {
    case 'line':
      return lineSegmentMass(primitive.from, primitive.to);

    case 'polyline': {
      const pts = primitive.points;
      if (pts.length < 2) {
        return { length: 0, centroid: pts[0] ?? { x: 0, y: 0 } };
      }
      let weightedX = 0;
      let weightedY = 0;
      let totalLen = 0;
      const segCount = primitive.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < segCount; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        const seg = lineSegmentMass(a, b);
        weightedX += seg.centroid.x * seg.length;
        weightedY += seg.centroid.y * seg.length;
        totalLen += seg.length;
      }
      if (totalLen < 1e-6) {
        return { length: 0, centroid: pts[0]! };
      }
      return {
        length: totalLen,
        centroid: { x: weightedX / totalLen, y: weightedY / totalLen },
      };
    }

    case 'arc':
      return circularArcMass(
        primitive.center,
        primitive.radius,
        primitive.startAngleDeg,
        primitive.sweepAngleDeg
      );
  }
}

/**
 * Computes the true length-weighted geometric centroid of a piece across all its stroke primitives.
 */
export function computeTrueGeometricCentroid(
  primitives: readonly WorldStrokePrimitive[]
): { centroid: Point2D; totalLength: number } {
  if (primitives.length === 0) {
    throw new Error('Sigil piece must contain at least one stroke primitive.');
  }

  let sumWeightedX = 0;
  let sumWeightedY = 0;
  let totalLength = 0;

  for (const prim of primitives) {
    const mass = computePrimitiveMass(prim);
    sumWeightedX += mass.centroid.x * mass.length;
    sumWeightedY += mass.centroid.y * mass.length;
    totalLength += mass.length;
  }

  if (totalLength < 1e-6) {
    const fallback = computePrimitiveMass(primitives[0]!).centroid;
    return { centroid: fallback, totalLength: 0 };
  }

  return {
    centroid: {
      x: sumWeightedX / totalLength,
      y: sumWeightedY / totalLength,
    },
    totalLength,
  };
}

function fmt(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function primitiveToSvgPath(
  primitive: WorldStrokePrimitive,
  offset: Point2D
): string {
  const ox = offset.x;
  const oy = offset.y;

  switch (primitive.kind) {
    case 'line': {
      const x1 = fmt(primitive.from.x - ox);
      const y1 = fmt(primitive.from.y - oy);
      const x2 = fmt(primitive.to.x - ox);
      const y2 = fmt(primitive.to.y - oy);
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }

    case 'polyline': {
      if (primitive.points.length === 0) return '';
      const commands = primitive.points.map((pt, idx) => {
        const prefix = idx === 0 ? 'M' : 'L';
        return `${prefix} ${fmt(pt.x - ox)} ${fmt(pt.y - oy)}`;
      });
      if (primitive.closed) commands.push('Z');
      return commands.join(' ');
    }

    case 'arc': {
      const { center, radius, startAngleDeg, sweepAngleDeg } = primitive;
      const cx = center.x - ox;
      const cy = center.y - oy;
      const clampedSweep =
        Math.abs(sweepAngleDeg) >= 360
          ? Math.sign(sweepAngleDeg || 1) * 360
          : sweepAngleDeg;

      // Full circle requires two 180-deg SVG arcs
      if (Math.abs(clampedSweep) >= 359.99) {
        const p1 = polarPoint(radius, startAngleDeg, { x: cx, y: cy });
        const p2 = polarPoint(radius, startAngleDeg + 180, { x: cx, y: cy });
        const r = fmt(radius);
        const sweepFlag = clampedSweep >= 0 ? 1 : 0;
        return [
          `M ${fmt(p1.x)} ${fmt(p1.y)}`,
          `A ${r} ${r} 0 1 ${sweepFlag} ${fmt(p2.x)} ${fmt(p2.y)}`,
          `A ${r} ${r} 0 1 ${sweepFlag} ${fmt(p1.x)} ${fmt(p1.y)}`,
        ].join(' ');
      }

      const startPt = polarPoint(radius, startAngleDeg, { x: cx, y: cy });
      const endPt = polarPoint(radius, startAngleDeg + clampedSweep, {
        x: cx,
        y: cy,
      });
      const largeArcFlag = Math.abs(clampedSweep) > 180 ? 1 : 0;
      const sweepFlag = clampedSweep >= 0 ? 1 : 0;
      const r = fmt(radius);

      return `M ${fmt(startPt.x)} ${fmt(startPt.y)} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${fmt(endPt.x)} ${fmt(endPt.y)}`;
    }
  }
}

function sampleSegmentPoints(
  a: Point2D,
  b: Point2D,
  spacingPx: number
): Point2D[] {
  const len = distanceBetween(a, b);
  const steps = Math.max(2, Math.ceil(len / spacingPx));
  const points: Point2D[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    });
  }
  return points;
}

function sampleWorldPrimitive(
  primitive: WorldStrokePrimitive,
  spacingPx: number
): Point2D[] {
  switch (primitive.kind) {
    case 'line':
      return sampleSegmentPoints(primitive.from, primitive.to, spacingPx);

    case 'polyline': {
      const pts = primitive.points;
      if (pts.length < 2) return [...pts];
      const out: Point2D[] = [];
      const segCount = primitive.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < segCount; i++) {
        const segSamples = sampleSegmentPoints(
          pts[i]!,
          pts[(i + 1) % pts.length]!,
          spacingPx
        );
        // Avoid duplicating joint vertices
        if (i > 0) segSamples.shift();
        out.push(...segSamples);
      }
      return out;
    }

    case 'arc': {
      const { center, radius, startAngleDeg, sweepAngleDeg } = primitive;
      const clampedSweep =
        Math.abs(sweepAngleDeg) >= 360
          ? Math.sign(sweepAngleDeg || 1) * 360
          : sweepAngleDeg;
      const arcLen = radius * degToRad(Math.abs(clampedSweep));
      const steps = Math.max(6, Math.ceil(arcLen / spacingPx));
      const isClosedCircle = Math.abs(clampedSweep) >= 359.99;
      const count = isClosedCircle ? steps - 1 : steps;
      const out: Point2D[] = [];
      for (let i = 0; i <= count; i++) {
        const t = i / steps;
        out.push(polarPoint(radius, startAngleDeg + clampedSweep * t, center));
      }
      return out;
    }
  }
}

/**
 * Symmetric Hausdorff distance between two visible geometry point clouds.
 * Returns the worst-case distance from any sampled visible point on A to its nearest
 * visible point on B (and vice versa), ensuring subsets or partial overlaps never falsely match.
 */
export function computeBidirectionalMaxDeviation(
  cloudA: readonly Point2D[],
  cloudB: readonly Point2D[],
  earlyExitThresholdPx: number = Infinity
): number {
  if (cloudA.length === 0 || cloudB.length === 0) return Infinity;
  const thresholdSq = earlyExitThresholdPx * earlyExitThresholdPx;

  let maxMinDistSq = 0;

  for (let i = 0; i < cloudA.length; i++) {
    const pa = cloudA[i]!;
    let nearestSq = Infinity;
    for (let j = 0; j < cloudB.length; j++) {
      const pb = cloudB[j]!;
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      const dSq = dx * dx + dy * dy;
      if (dSq < nearestSq) nearestSq = dSq;
    }
    if (nearestSq > maxMinDistSq) {
      maxMinDistSq = nearestSq;
      if (maxMinDistSq > thresholdSq) return Math.sqrt(maxMinDistSq);
    }
  }

  for (let j = 0; j < cloudB.length; j++) {
    const pb = cloudB[j]!;
    let nearestSq = Infinity;
    for (let i = 0; i < cloudA.length; i++) {
      const pa = cloudA[i]!;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dSq = dx * dx + dy * dy;
      if (dSq < nearestSq) nearestSq = dSq;
    }
    if (nearestSq > maxMinDistSq) {
      maxMinDistSq = nearestSq;
      if (maxMinDistSq > thresholdSq) return Math.sqrt(maxMinDistSq);
    }
  }

  return Math.sqrt(maxMinDistSq);
}

/**
 * Detects rotational self-symmetries of a piece from its complete visible stroke geometry.
 * Evaluates all common crystallographic / polygonal symmetries (every 15 deg, including 45, 60, 72, 90, 120, 180).
 */
export function detectPieceRotationalSymmetries(
  localSamplePoints: readonly Point2D[],
  epsilonPx: number = 0.85
): number[] {
  // Candidate symmetry orders covering 2, 3, 4, 5, 6, 8, 12, 24-fold + full circular symmetry
  const candidateAngles = new Set<number>([0]);
  for (let deg = 15; deg < 360; deg += 15) candidateAngles.add(deg);
  for (const fifth of [72, 144, 216, 288]) candidateAngles.add(fifth);

  const sortedCandidates = [...candidateAngles].sort((a, b) => a - b);
  const validAngles: number[] = [];

  for (const angleDeg of sortedCandidates) {
    if (angleDeg === 0) {
      validAngles.push(0);
      continue;
    }
    const rotated = localSamplePoints.map((pt) =>
      rotatePointAroundOrigin(pt, angleDeg)
    );
    const deviation = computeBidirectionalMaxDeviation(
      rotated,
      localSamplePoints,
      epsilonPx
    );
    if (deviation <= epsilonPx) {
      validAngles.push(angleDeg);
    }
  }

  return validAngles;
}

export function compilePieceBlueprint(
  blueprint: RawPieceBlueprint
): NormalizedPieceDefinition {
  const { centroid, totalLength } = computeTrueGeometricCentroid(
    blueprint.primitives
  );

  const worldPathD = blueprint.primitives
    .map((prim) => primitiveToSvgPath(prim, { x: 0, y: 0 }))
    .join(' ');

  const localPathD = blueprint.primitives
    .map((prim) => primitiveToSvgPath(prim, centroid))
    .join(' ');

  const worldSamplePoints = blueprint.primitives.flatMap((prim) =>
    sampleWorldPrimitive(prim, SAMPLE_SPACING_PX)
  );

  const localSamplePoints = worldSamplePoints.map((pt) => ({
    x: pt.x - centroid.x,
    y: pt.y - centroid.y,
  }));

  let boundingRadius = 12;
  for (const pt of localSamplePoints) {
    const r = Math.hypot(pt.x, pt.y);
    if (r > boundingRadius) boundingRadius = r;
  }

  const selfSymmetryAnglesDeg =
    detectPieceRotationalSymmetries(localSamplePoints);

  return {
    id: blueprint.id,
    targetCentroid: centroid,
    totalLength,
    boundingRadius,
    localPathD,
    worldPathD,
    localSamplePoints,
    worldSamplePoints,
    selfSymmetryAnglesDeg,
  };
}

export function compileSigilBlueprint(
  raw: RawSigilBlueprint
): CompiledSigilPuzzle {
  const pieces = raw.pieces.map(compilePieceBlueprint);
  const unifiedSilhouettePathD = pieces.map((p) => p.worldPathD).join(' ');

  return {
    id: raw.id,
    name: raw.name,
    subtitle: raw.subtitle,
    pieces,
    unifiedSilhouettePathD,
  };
}

/**
 * Calculates minimum discrete rotation taps (in ROTATION_STEP_DEG increments) needed
 * to reach ANY valid symmetric orientation of `piece` from `currentRotationDeg`.
 */
export function computeMinimumRotationSteps(
  currentRotationDeg: number,
  validSymmetryAnglesDeg: readonly number[]
): number {
  let minSteps = Infinity;
  for (const targetAngle of validSymmetryAnglesDeg) {
    const delta = shortestAngleDistanceDeg(currentRotationDeg, targetAngle);
    const steps = Math.round(delta / ROTATION_STEP_DEG);
    if (steps < minSteps) minSteps = steps;
  }
  return Number.isFinite(minSteps) ? minSteps : 0;
}

/**
 * Clamps `candidateOrigin` so every rotated visible point of `piece` stays strictly
 * inside `[marginPx, STAGE_VIEWBOX_SIZE - marginPx]`.
 */
export function clampPositionForRotatedPiece(
  piece: NormalizedPieceDefinition,
  candidateOrigin: Point2D,
  rotationDeg: number,
  marginPx: number = STAGE_PADDING_PX
): Point2D {
  let minLocalX = 0;
  let maxLocalX = 0;
  let minLocalY = 0;
  let maxLocalY = 0;

  for (const localPt of piece.localSamplePoints) {
    const rotPt = rotatePointAroundOrigin(localPt, rotationDeg);
    if (rotPt.x < minLocalX) minLocalX = rotPt.x;
    if (rotPt.x > maxLocalX) maxLocalX = rotPt.x;
    if (rotPt.y < minLocalY) minLocalY = rotPt.y;
    if (rotPt.y > maxLocalY) maxLocalY = rotPt.y;
  }

  const minAllowedX = Math.min(
    SANCTUM_CENTER,
    Math.max(marginPx, marginPx - minLocalX)
  );
  const maxAllowedX = Math.max(
    SANCTUM_CENTER,
    Math.min(
      STAGE_VIEWBOX_SIZE - marginPx,
      STAGE_VIEWBOX_SIZE - marginPx - maxLocalX
    )
  );
  const minAllowedY = Math.min(
    SANCTUM_CENTER,
    Math.max(marginPx, marginPx - minLocalY)
  );
  const maxAllowedY = Math.max(
    SANCTUM_CENTER,
    Math.min(
      STAGE_VIEWBOX_SIZE - marginPx,
      STAGE_VIEWBOX_SIZE - marginPx - maxLocalY
    )
  );

  return {
    x: Math.max(minAllowedX, Math.min(maxAllowedX, candidateOrigin.x)),
    y: Math.max(minAllowedY, Math.min(maxAllowedY, candidateOrigin.y)),
  };
}

/**
 * Deterministically scatters all pieces into a clean outer ring around the central sanctum.
 * Guarantees:
 * - Every rotated stroke tip stays >= STAGE_PADDING_PX inside the 520x520 basalt frame
 * - Pairwise centroid repulsion prevents pieces from piling up even on 9-piece Master levels
 * - No piece starts within snap distance of its target slot
 * - Every piece with discrete asymmetry starts rotated away from all valid solved angles
 */
export function createScatteredPieceStates(
  puzzle: CompiledSigilPuzzle,
  seed: string
): PieceRuntimeState[] {
  const rng = createSeededRng(seed);
  const count = puzzle.pieces.length;
  const slotIndices = rng.shuffle(
    Array.from({ length: count }, (_, idx) => idx)
  );
  const baseAngleOffset = rng.nextFloat() * 360;
  const allStepAngles = [0, 45, 90, 135, 180, 225, 270, 315];

  const drafts = puzzle.pieces.map((piece, idx) => {
    const nonSolvedSteps = allStepAngles.filter((candidate) =>
      piece.selfSymmetryAnglesDeg.every(
        (sym) =>
          shortestAngleDistanceDeg(candidate, sym) >
          GEOMETRY_CONGRUENCE_EPSILON_PX + 8
      )
    );

    const chosenRotationDeg =
      nonSolvedSteps.length > 0
        ? nonSolvedSteps[rng.nextInt(0, nonSolvedSteps.length - 1)]!
        : allStepAngles[rng.nextInt(1, allStepAngles.length - 1)]!;

    const ringIndex = slotIndices[idx]!;
    const sectorAngleDeg =
      baseAngleOffset + (ringIndex * 360) / count + (rng.nextFloat() * 10 - 5);

    const rawRadius =
      SCATTER_INNER_RADIUS +
      rng.nextFloat() * (SCATTER_OUTER_RADIUS - SCATTER_INNER_RADIUS);

    let pos = clampPositionForRotatedPiece(
      piece,
      polarPoint(rawRadius, sectorAngleDeg),
      chosenRotationDeg
    );

    if (
      distanceBetween(pos, piece.targetCentroid) <=
      SNAP_DISTANCE_PX * 1.75
    ) {
      pos = clampPositionForRotatedPiece(
        piece,
        polarPoint(SCATTER_OUTER_RADIUS, sectorAngleDeg + 180),
        chosenRotationDeg
      );
    }

    return {
      piece,
      sectorAngleDeg,
      position: pos,
      rotationDeg: chosenRotationDeg,
    };
  });

  // Gentle deterministic pairwise repulsion + sanctum pushout so 8-9 pieces breathe cleanly
  const minCentroidSpacing = count >= 9 ? 68 : count >= 8 ? 74 : 80;
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 0; i < drafts.length; i++) {
      for (let j = i + 1; j < drafts.length; j++) {
        const a = drafts[i]!;
        const b = drafts[j]!;
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const dist = Math.hypot(dx, dy);
        if (dist < minCentroidSpacing) {
          const push = (minCentroidSpacing - Math.max(1, dist)) * 0.45;
          const ux = dist > 1e-3 ? dx / dist : Math.cos(degToRad(i * 45));
          const uy = dist > 1e-3 ? dy / dist : Math.sin(degToRad(i * 45));

          a.position = clampPositionForRotatedPiece(
            a.piece,
            { x: a.position.x - ux * push, y: a.position.y - uy * push },
            a.rotationDeg
          );
          b.position = clampPositionForRotatedPiece(
            b.piece,
            { x: b.position.x + ux * push, y: b.position.y + uy * push },
            b.rotationDeg
          );
        }
      }
    }

    for (const d of drafts) {
      // Ensure scatter stays clear of its own targetCentroid after repulsion
      if (
        distanceBetween(d.position, d.piece.targetCentroid) <=
        SNAP_DISTANCE_PX * 1.5
      ) {
        d.position = clampPositionForRotatedPiece(
          d.piece,
          polarPoint(SCATTER_OUTER_RADIUS, d.sectorAngleDeg + 155),
          d.rotationDeg
        );
      }
    }
  }

  return drafts.map(({ piece, position, rotationDeg }) => {
    const minRotSteps = computeMinimumRotationSteps(
      rotationDeg,
      piece.selfSymmetryAnglesDeg
    );
    let minCwTaps = Infinity;
    for (const sym of piece.selfSymmetryAnglesDeg) {
      const cwDelta = normalizeAngleDeg(sym - rotationDeg);
      const cwSteps = Math.round(cwDelta / ROTATION_STEP_DEG) % 8;
      if (cwSteps < minCwTaps) minCwTaps = cwSteps;
    }
    const parMoves = 1 + Math.min(minRotSteps + 1, minCwTaps);

    return {
      id: piece.id,
      position,
      rotationDeg,
      locked: false,
      lockedSlotId: null,
      parMoves,
    };
  });
}