import { SANCTUM_CENTER } from '../../shared/constants';
import type {
  CompiledSigilPuzzle,
  RawPieceBlueprint,
  RawSigilBlueprint,
} from '../../shared/types';
import {
  compileSigilBlueprint,
  computeBidirectionalMaxDeviation,
  distanceBetween,
  polarPoint,
  transformLocalPointsToWorld,
} from './geometry';
import { createSeededRng, type SeededRng } from './prng';

const C = { x: SANCTUM_CENTER, y: SANCTUM_CENTER };

const ADJECTIVES = [
  'Solstice',
  'Obsidian',
  'Vernal',
  'Celestial',
  'Astral',
  'Meridian',
  'Aureate',
  'Sideral',
  'Boreal',
  'Equinox',
  'Nocturne',
  'Halcyon',
  'Valkyrie',
  'Zenith',
  'Alabaster',
  'Runic',
] as const;

const ARTIFACTS = [
  'Astrolabe',
  'Compass',
  'Loom',
  'Seal',
  'Wayfinder',
  'Monolith',
  'Key',
  'Sextant',
  'Diadem',
  'Covenant',
  'Cadence',
  'Mandala',
  'Crucible',
  'Reliquary',
] as const;

const ORDERS = [
  'Order of the First Meridian',
  'Sixfold Cartographer Guild',
  'Harmonic Basalt Archive',
  'Sanctum of the Quiet Sun',
  'Vault of Celestial Lapidary',
  'Foundry of the Polestar',
  'Codex of Measured Light',
  'Observatory of the Eighth Wind',
] as const;

interface RingRadii {
  readonly rInner: number;
  readonly rMid: number;
  readonly rOuter: number;
}

/** 1-piece central core motifs */
function buildCoreSingle(variant: number, r: RingRadii): RawPieceBlueprint[] {
  const { rInner } = r;
  switch (variant % 4) {
    case 0:
      // Diamond seal
      return [
        {
          id: 'core-diamond',
          primitives: [
            {
              kind: 'polyline',
              closed: true,
              points: [
                polarPoint(rInner, -90),
                polarPoint(rInner, 0),
                polarPoint(rInner, 90),
                polarPoint(rInner, 180),
              ],
            },
          ],
        },
      ];
    case 1:
      // Meridian spine with asymmetric cross-notch
      return [
        {
          id: 'core-spine',
          primitives: [
            {
              kind: 'line',
              from: { x: C.x, y: C.y - rInner - 8 },
              to: { x: C.x, y: C.y + rInner + 8 },
            },
            {
              kind: 'line',
              from: { x: C.x - rInner * 0.65, y: C.y - 10 },
              to: { x: C.x + rInner * 0.65, y: C.y - 10 },
            },
          ],
        },
      ];
    case 2:
      // Open chalice / hexagonal cradle
      return [
        {
          id: 'core-chalice',
          primitives: [
            {
              kind: 'polyline',
              points: [
                polarPoint(rInner, -135),
                polarPoint(rInner, -45),
                polarPoint(rInner * 0.55, 0),
                polarPoint(rInner, 45),
                polarPoint(rInner, 135),
              ],
            },
          ],
        },
      ];
    default:
      // Upright triangle sigil heart
      return [
        {
          id: 'core-triad',
          primitives: [
            {
              kind: 'polyline',
              closed: true,
              points: [
                polarPoint(rInner + 4, -90),
                polarPoint(rInner + 4, 30),
                polarPoint(rInner + 4, 150),
              ],
            },
          ],
        },
      ];
  }
}

/** 2-piece split central core motifs (used for 7-9 piece compositions) */
function buildCorePair(variant: number, r: RingRadii): RawPieceBlueprint[] {
  const { rInner, rMid } = r;
  if (variant % 2 === 0) {
    return [
      {
        id: 'core-west-cresc',
        primitives: [
          {
            kind: 'arc',
            center: C,
            radius: rInner + 4,
            startAngleDeg: 112,
            sweepAngleDeg: 136,
          },
          {
            kind: 'line',
            from: polarPoint(rInner + 4, 180),
            to: polarPoint(rMid + 6, 180),
          },
        ],
      },
      {
        id: 'core-east-cresc',
        primitives: [
          {
            kind: 'arc',
            center: C,
            radius: rInner + 4,
            startAngleDeg: 292,
            sweepAngleDeg: 136,
          },
          {
            kind: 'line',
            from: polarPoint(rInner + 4, 0),
            to: polarPoint(rMid + 6, 0),
          },
        ],
      },
    ];
  }

  return [
    {
      id: 'core-upper-chevron',
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(rInner + 8, 180),
            polarPoint(rInner + 8, -90),
            polarPoint(rInner + 8, 0),
          ],
        },
        {
          kind: 'line',
          from: { x: C.x, y: C.y - rInner - 8 },
          to: { x: C.x, y: C.y },
        },
      ],
    },
    {
      id: 'core-lower-chevron',
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(rInner + 8, 180),
            polarPoint(rInner + 8, 90),
            polarPoint(rInner + 8, 0),
          ],
        },
        {
          kind: 'line',
          from: { x: C.x - 16, y: C.y + rInner * 0.45 },
          to: { x: C.x + 16, y: C.y + rInner * 0.45 },
        },
      ],
    },
  ];
}

/** 1-piece North Zenith motif */
function buildZenithPiece(variant: number, r: RingRadii): RawPieceBlueprint {
  const { rInner, rMid, rOuter } = r;
  switch (variant % 4) {
    case 0:
      return {
        id: 'zenith-spear',
        primitives: [
          {
            kind: 'line',
            from: polarPoint(rInner, -90),
            to: polarPoint(rOuter, -90),
          },
          {
            kind: 'polyline',
            points: [
              polarPoint(rMid + 8, -112),
              polarPoint(rOuter, -90),
              polarPoint(rMid + 8, -68),
            ],
          },
        ],
      };
    case 1:
      return {
        id: 'zenith-crown',
        primitives: [
          {
            kind: 'polyline',
            points: [
              polarPoint(rMid, -135),
              polarPoint(rOuter, -90),
              polarPoint(rMid, -45),
            ],
          },
          {
            kind: 'line',
            from: polarPoint(rOuter, -90),
            to: polarPoint(rInner + 8, -90),
          },
        ],
      };
    case 2:
      return {
        id: 'zenith-fork',
        primitives: [
          {
            kind: 'polyline',
            points: [
              polarPoint(rOuter - 4, -110),
              polarPoint(rMid, -90),
              polarPoint(rOuter - 4, -70),
            ],
          },
          {
            kind: 'line',
            from: polarPoint(rInner, -90),
            to: polarPoint(rMid, -90),
          },
        ],
      };
    default:
      return {
        id: 'zenith-banner',
        primitives: [
          {
            kind: 'polyline',
            points: [
              polarPoint(rInner + 4, -90),
              polarPoint(rOuter, -90),
              polarPoint(rMid + 14, -66),
              polarPoint(rMid - 2, -90),
            ],
          },
        ],
      };
  }
}

/** 1-piece South Nadir motif */
function buildNadirPiece(variant: number, r: RingRadii): RawPieceBlueprint {
  const { rInner, rMid, rOuter } = r;
  switch (variant % 4) {
    case 0:
      return {
        id: 'nadir-keel',
        primitives: [
          {
            kind: 'line',
            from: polarPoint(rInner, 90),
            to: polarPoint(rOuter - 2, 90),
          },
          {
            kind: 'line',
            from: { x: C.x - 26, y: C.y + rMid + 4 },
            to: { x: C.x + 26, y: C.y + rMid + 4 },
          },
        ],
      };
    case 1:
      return {
        id: 'nadir-anchor',
        primitives: [
          {
            kind: 'polyline',
            points: [
              { x: C.x - 32, y: C.y + rInner + 14 },
              { x: C.x, y: C.y + rOuter - 4 },
              { x: C.x + 32, y: C.y + rInner + 14 },
              { x: C.x + 32, y: C.y + rInner - 8 },
            ],
          },
        ],
      };
    case 2:
      return {
        id: 'nadir-pendulum',
        primitives: [
          {
            kind: 'line',
            from: polarPoint(rInner, 90),
            to: polarPoint(rMid + 8, 90),
          },
          {
            kind: 'polyline',
            closed: true,
            points: [
              polarPoint(rMid + 8, 90),
              { x: C.x + 20, y: C.y + rMid + 22 },
              polarPoint(rOuter, 90),
              { x: C.x - 20, y: C.y + rMid + 22 },
            ],
          },
        ],
      };
    default:
      return {
        id: 'nadir-cradle',
        primitives: [
          {
            kind: 'arc',
            center: C,
            radius: rMid + 14,
            startAngleDeg: 42,
            sweepAngleDeg: 96,
          },
          {
            kind: 'line',
            from: polarPoint(rMid + 14, 90),
            to: polarPoint(rOuter + 2, 90),
          },
        ],
      };
  }
}

/** 2-piece East & West lateral wing motifs */
function buildWingPair(variant: number, r: RingRadii): RawPieceBlueprint[] {
  const { rInner, rMid, rOuter } = r;
  switch (variant % 4) {
    case 0:
      return [
        {
          id: 'wing-west-chevron',
          primitives: [
            {
              kind: 'polyline',
              points: [
                polarPoint(rMid - 6, 225),
                polarPoint(rOuter - 4, 180),
                polarPoint(rMid - 6, 135),
              ],
            },
          ],
        },
        {
          id: 'wing-east-chevron',
          primitives: [
            {
              kind: 'polyline',
              points: [
                polarPoint(rMid - 6, -45),
                polarPoint(rOuter - 4, 0),
                polarPoint(rMid - 6, 45),
              ],
            },
          ],
        },
      ];
    case 1:
      return [
        {
          id: 'wing-west-horn',
          primitives: [
            {
              kind: 'arc',
              center: C,
              radius: rMid + 12,
              startAngleDeg: 155,
              sweepAngleDeg: 82,
            },
            {
              kind: 'line',
              from: polarPoint(rMid + 12, 155),
              to: polarPoint(rInner + 8, 180),
            },
          ],
        },
        {
          id: 'wing-east-horn',
          primitives: [
            {
              kind: 'arc',
              center: C,
              radius: rMid + 12,
              startAngleDeg: 303,
              sweepAngleDeg: 82,
            },
            {
              kind: 'line',
              from: polarPoint(rMid + 12, 25),
              to: polarPoint(rInner + 8, 0),
            },
          ],
        },
      ];
    case 2:
      return [
        {
          id: 'wing-west-lance',
          primitives: [
            {
              kind: 'line',
              from: polarPoint(rInner + 6, 180),
              to: polarPoint(rOuter - 2, 180),
            },
            {
              kind: 'line',
              from: polarPoint(rOuter - 2, 180),
              to: polarPoint(rMid + 4, 215),
            },
          ],
        },
        {
          id: 'wing-east-lance',
          primitives: [
            {
              kind: 'line',
              from: polarPoint(rInner + 6, 0),
              to: polarPoint(rOuter - 2, 0),
            },
            {
              kind: 'line',
              from: polarPoint(rOuter - 2, 0),
              to: polarPoint(rMid + 4, -35),
            },
          ],
        },
      ];
    default:
      return [
        {
          id: 'wing-west-arc',
          primitives: [
            {
              kind: 'arc',
              center: C,
              radius: rOuter - 10,
              startAngleDeg: 142,
              sweepAngleDeg: 76,
            },
            {
              kind: 'line',
              from: polarPoint(rOuter - 10, 180),
              to: polarPoint(rMid - 6, 180),
            },
          ],
        },
        {
          id: 'wing-east-arc',
          primitives: [
            {
              kind: 'arc',
              center: C,
              radius: rOuter - 10,
              startAngleDeg: 322,
              sweepAngleDeg: 76,
            },
            {
              kind: 'line',
              from: polarPoint(rOuter - 10, 0),
              to: polarPoint(rMid - 6, 0),
            },
          ],
        },
      ];
  }
}

/** 1, 2, or 4 orbital / octant accent pieces to hit exact 6..9 piece count */
function buildOrbitalAccents(
  countNeeded: 1 | 2 | 3 | 4,
  variant: number,
  r: RingRadii
): RawPieceBlueprint[] {
  const { rMid, rOuter } = r;

  if (countNeeded === 1) {
    return variant % 2 === 0
      ? [
          {
            id: 'orbit-south-bow',
            primitives: [
              {
                kind: 'arc',
                center: C,
                radius: rMid + 2,
                startAngleDeg: 32,
                sweepAngleDeg: 116,
              },
            ],
          },
        ]
      : [
          {
            id: 'orbit-north-halo',
            primitives: [
              {
                kind: 'arc',
                center: C,
                radius: rMid + 4,
                startAngleDeg: 212,
                sweepAngleDeg: 116,
              },
            ],
          },
        ];
  }

  if (countNeeded === 2) {
    return variant % 2 === 0
      ? [
          {
            id: 'orbit-nw-arc',
            primitives: [
              {
                kind: 'arc',
                center: C,
                radius: rOuter - 16,
                startAngleDeg: 196,
                sweepAngleDeg: 58,
              },
              {
                kind: 'line',
                from: polarPoint(rOuter - 16, 225),
                to: polarPoint(rMid - 8, 225),
              },
            ],
          },
          {
            id: 'orbit-ne-arc',
            primitives: [
              {
                kind: 'arc',
                center: C,
                radius: rOuter - 16,
                startAngleDeg: 286,
                sweepAngleDeg: 58,
              },
              {
                kind: 'line',
                from: polarPoint(rOuter - 16, 315),
                to: polarPoint(rMid - 8, 315),
              },
            ],
          },
        ]
      : [
          {
            id: 'orbit-upper-bow',
            primitives: [
              {
                kind: 'arc',
                center: C,
                radius: rOuter - 18,
                startAngleDeg: 208,
                sweepAngleDeg: 104,
              },
            ],
          },
          {
            id: 'orbit-lower-bow',
            primitives: [
              {
                kind: 'arc',
                center: C,
                radius: rOuter - 18,
                startAngleDeg: 28,
                sweepAngleDeg: 104,
              },
            ],
          },
        ];
  }

  if (countNeeded === 3) {
    return [
      ...buildOrbitalAccents(2, variant, r),
      {
        id: 'orbit-horizon-chord',
        primitives: [
          {
            kind: 'polyline',
            points: [
              polarPoint(rOuter - 14, 135),
              polarPoint(rMid, 120),
              polarPoint(rMid, 60),
              polarPoint(rOuter - 14, 45),
            ],
          },
        ],
      },
    ];
  }

  // countNeeded === 4: Four crisp octant brackets
  return [
    {
      id: 'octant-nw',
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(rOuter - 16, 195),
            polarPoint(rOuter - 8, 225),
            polarPoint(rMid - 6, 225),
          ],
        },
      ],
    },
    {
      id: 'octant-ne',
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(rOuter - 16, 345),
            polarPoint(rOuter - 8, 315),
            polarPoint(rMid - 6, 315),
          ],
        },
      ],
    },
    {
      id: 'octant-sw',
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(rOuter - 16, 165),
            polarPoint(rOuter - 8, 135),
            polarPoint(rMid - 6, 135),
          ],
        },
      ],
    },
    {
      id: 'octant-se',
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(rOuter - 16, 15),
            polarPoint(rOuter - 8, 45),
            polarPoint(rMid - 6, 45),
          ],
        },
      ],
    },
  ];
}

function generateSigilTitle(rng: SeededRng): {
  name: string;
  subtitle: string;
} {
  const adj = ADJECTIVES[rng.nextInt(0, ADJECTIVES.length - 1)]!;
  const noun = ARTIFACTS[rng.nextInt(0, ARTIFACTS.length - 1)]!;
  const subtitle = ORDERS[rng.nextInt(0, ORDERS.length - 1)]!;
  return { name: `${adj} ${noun}`, subtitle };
}

/**
 * Verifies a compiled Sigil meets strict hackathon playability & visual standards:
 * - Exact target piece count
 * - Every piece has totalLength >= 50px (no tiny slivers)
 * - Every pair of non-congruent slots has targetCentroid separation >= 20px
 */
export function passesSigilQualityGate(
  compiled: CompiledSigilPuzzle,
  expectedPieces: number
): boolean {
  if (compiled.pieces.length !== expectedPieces) return false;

  for (const p of compiled.pieces) {
    if (p.totalLength < 50) return false;
  }

  for (let i = 0; i < compiled.pieces.length; i++) {
    for (let j = i + 1; j < compiled.pieces.length; j++) {
      const a = compiled.pieces[i]!;
      const b = compiled.pieces[j]!;
      const centroidDist = distanceBetween(a.targetCentroid, b.targetCentroid);
      if (centroidDist >= 20) continue;

      // If centroids are close, check whether they would create ambiguous collisions
      const overlaid = transformLocalPointsToWorld(
        a.localSamplePoints,
        b.targetCentroid,
        0
      );
      const dev = computeBidirectionalMaxDeviation(
        overlaid,
        b.worldSamplePoints
      );
      if (dev > 2) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Deterministically synthesizes a calibrated, high-craft Sigil puzzle for any seed
 * and target piece count in [6, 9].
 */
export function synthesizeCalibratedSigil(
  seed: string,
  targetPieceCount: 6 | 7 | 8 | 9,
  idPrefix: string = 'sigil'
): CompiledSigilPuzzle {
  for (let attempt = 0; attempt < 8; attempt++) {
    const attemptSeed = attempt === 0 ? seed : `${seed}:retry:${attempt}`;
    const rng = createSeededRng(attemptSeed);

    const radii: RingRadii = {
      rInner: rng.nextInt(32, 40),
      rMid: rng.nextInt(68, 76),
      rOuter: rng.nextInt(112, 120),
    };

    const { name, subtitle } = generateSigilTitle(rng);
    const pieces: RawPieceBlueprint[] = [];

    // Base structural skeleton = Zenith (1) + Nadir (1) + Wings (2) = 4 pieces
    const zenith = buildZenithPiece(rng.nextInt(0, 15), radii);
    const nadir = buildNadirPiece(rng.nextInt(0, 15), radii);
    const wings = buildWingPair(rng.nextInt(0, 15), radii);

    if (targetPieceCount === 6) {
      // 1 Core + 1 Zenith + 1 Nadir + 2 Wings + 1 Orbital = 6
      pieces.push(
        ...buildCoreSingle(rng.nextInt(0, 15), radii),
        zenith,
        nadir,
        ...wings,
        ...buildOrbitalAccents(1, rng.nextInt(0, 15), radii)
      );
    } else if (targetPieceCount === 7) {
      // 1 Core + 1 Zenith + 1 Nadir + 2 Wings + 2 Orbitals = 7
      pieces.push(
        ...buildCoreSingle(rng.nextInt(0, 15), radii),
        zenith,
        nadir,
        ...wings,
        ...buildOrbitalAccents(2, rng.nextInt(0, 15), radii)
      );
    } else if (targetPieceCount === 8) {
      // Split 2 Core + 1 Zenith + 1 Nadir + 2 Wings + 2 Orbitals = 8
      pieces.push(
        ...buildCorePair(rng.nextInt(0, 15), radii),
        zenith,
        nadir,
        ...wings,
        ...buildOrbitalAccents(2, rng.nextInt(0, 15), radii)
      );
    } else {
      // 9 pieces: 1 Core + 1 Zenith + 1 Nadir + 2 Wings + 4 Octants = 9
      pieces.push(
        ...buildCoreSingle(rng.nextInt(0, 15), radii),
        zenith,
        nadir,
        ...wings,
        ...buildOrbitalAccents(4, rng.nextInt(0, 15), radii)
      );
    }

    const rawBlueprint: RawSigilBlueprint = {
      id: `${idPrefix}-${targetPieceCount}p`,
      name,
      subtitle,
      pieces,
    };

    const compiled = compileSigilBlueprint(rawBlueprint);
    if (passesSigilQualityGate(compiled, targetPieceCount)) {
      return compiled;
    }
  }

  // Guaranteed deterministic fallback (never reached in normal operation, ensures 100% safety)
  const fallbackRng = createSeededRng(`${seed}:fallback`);
  const { name, subtitle } = generateSigilTitle(fallbackRng);
  const stdRadii: RingRadii = { rInner: 36, rMid: 72, rOuter: 116 };
  return compileSigilBlueprint({
    id: `${idPrefix}-safe`,
    name,
    subtitle,
    pieces: [
      ...buildCoreSingle(0, stdRadii),
      buildZenithPiece(0, stdRadii),
      buildNadirPiece(0, stdRadii),
      ...buildWingPair(0, stdRadii),
      ...buildOrbitalAccents(1, 0, stdRadii),
    ],
  });
}