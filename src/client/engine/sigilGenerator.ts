import { getEditionNumber, SANCTUM_CENTER } from '../../shared/constants';
import { resolveSigilIdentity } from '../../shared/dailyMeta';
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

interface RingRadii {
  readonly rInner: number;
  readonly rMid: number;
  readonly rOuter: number;
}

function normDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** 1-piece central core motifs (6 distinct geometric emblems) */
function buildCoreSingle(variant: number, r: RingRadii): RawPieceBlueprint[] {
  const { rInner } = r;
  switch (variant % 6) {
    case 0:
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
    case 3:
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
    case 4:
      // Hourglass prism
      return [
        {
          id: 'core-hourglass',
          primitives: [
            {
              kind: 'polyline',
              closed: true,
              points: [
                polarPoint(rInner, -125),
                polarPoint(rInner, -55),
                polarPoint(rInner, 125),
                polarPoint(rInner, 55),
              ],
            },
          ],
        },
      ];
    default:
      // Hexagonal signet
      return [
        {
          id: 'core-hexagon',
          primitives: [
            {
              kind: 'polyline',
              closed: true,
              points: [
                polarPoint(rInner - 2, 0),
                polarPoint(rInner - 2, 60),
                polarPoint(rInner - 2, 120),
                polarPoint(rInner - 2, 180),
                polarPoint(rInner - 2, 240),
                polarPoint(rInner - 2, 300),
              ],
            },
          ],
        },
      ];
  }
}

/** 2-piece split central core motifs */
function buildCorePair(
  variant: number,
  r: RingRadii,
  axisDeg: number = 0
): RawPieceBlueprint[] {
  const { rInner, rMid } = r;
  if (variant % 2 === 0) {
    return [
      {
        id: 'core-pair-a',
        primitives: [
          {
            kind: 'arc',
            center: C,
            radius: rInner + 4,
            startAngleDeg: normDeg(axisDeg + 112),
            sweepAngleDeg: 136,
          },
          {
            kind: 'line',
            from: polarPoint(rInner + 4, axisDeg + 180),
            to: polarPoint(rMid + 4, axisDeg + 180),
          },
        ],
      },
      {
        id: 'core-pair-b',
        primitives: [
          {
            kind: 'arc',
            center: C,
            radius: rInner + 4,
            startAngleDeg: normDeg(axisDeg + 292),
            sweepAngleDeg: 136,
          },
          {
            kind: 'line',
            from: polarPoint(rInner + 4, axisDeg),
            to: polarPoint(rMid + 4, axisDeg),
          },
        ],
      },
    ];
  }

  return [
    {
      id: 'core-chev-a',
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(rInner + 8, axisDeg + 180),
            polarPoint(rInner + 8, axisDeg - 90),
            polarPoint(rInner + 8, axisDeg),
          ],
        },
        {
          kind: 'line',
          from: polarPoint(rInner + 12, axisDeg - 90),
          to: C,
        },
      ],
    },
    {
      id: 'core-chev-b',
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(rInner + 8, axisDeg + 180),
            polarPoint(rInner + 8, axisDeg + 90),
            polarPoint(rInner + 8, axisDeg),
          ],
        },
        {
          kind: 'line',
          from: polarPoint(rInner * 0.65, axisDeg + 45),
          to: polarPoint(rInner * 0.65, axisDeg + 135),
        },
      ],
    },
  ];
}

// ============================================================================
// FAMILY 0: CARDINAL ASTROLABE (Upright N / S / E / W + Expanded Motifs)
// ============================================================================

function buildCardinalZenith(variant: number, r: RingRadii): RawPieceBlueprint {
  const { rInner, rMid, rOuter } = r;
  switch (variant % 5) {
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
    case 3:
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
    default:
      return {
        id: 'zenith-halberd',
        primitives: [
          {
            kind: 'arc',
            center: C,
            radius: rOuter - 6,
            startAngleDeg: 242,
            sweepAngleDeg: 56,
          },
          {
            kind: 'line',
            from: polarPoint(rInner + 6, -90),
            to: polarPoint(rOuter + 2, -90),
          },
        ],
      };
  }
}

function buildCardinalNadir(variant: number, r: RingRadii): RawPieceBlueprint {
  const { rInner, rMid, rOuter } = r;
  switch (variant % 5) {
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
    case 3:
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
    default:
      return {
        id: 'nadir-trident',
        primitives: [
          {
            kind: 'polyline',
            points: [
              polarPoint(rOuter - 8, 114),
              polarPoint(rMid + 2, 102),
              polarPoint(rMid + 2, 78),
              polarPoint(rOuter - 8, 66),
            ],
          },
          {
            kind: 'line',
            from: polarPoint(rInner + 6, 90),
            to: polarPoint(rOuter, 90),
          },
        ],
      };
  }
}

function buildCardinalWings(variant: number, r: RingRadii): RawPieceBlueprint[] {
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
    case 2:
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
    default:
      return [
        {
          id: 'wing-west-caliper',
          primitives: [
            {
              kind: 'polyline',
              points: [
                polarPoint(rOuter - 8, 206),
                polarPoint(rMid + 4, 194),
                polarPoint(rMid + 4, 166),
                polarPoint(rOuter - 8, 154),
              ],
            },
          ],
        },
        {
          id: 'wing-east-caliper',
          primitives: [
            {
              kind: 'polyline',
              points: [
                polarPoint(rOuter - 8, -26),
                polarPoint(rMid + 4, -14),
                polarPoint(rMid + 4, 14),
                polarPoint(rOuter - 8, 26),
              ],
            },
          ],
        },
      ];
  }
}

function buildCardinalOrbitals(
  countNeeded: 1 | 2 | 4,
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
    switch (variant % 3) {
      case 0:
        return [
          {
            id: 'orbit-nw-spur',
            primitives: [
              {
                kind: 'arc',
                center: C,
                radius: rOuter - 14,
                startAngleDeg: 198,
                sweepAngleDeg: 54,
              },
              {
                kind: 'line',
                from: polarPoint(rOuter - 14, 225),
                to: polarPoint(rMid - 8, 225),
              },
            ],
          },
          {
            id: 'orbit-se-spur',
            primitives: [
              {
                kind: 'arc',
                center: C,
                radius: rOuter - 14,
                startAngleDeg: 18,
                sweepAngleDeg: 54,
              },
              {
                kind: 'line',
                from: polarPoint(rOuter - 14, 45),
                to: polarPoint(rMid - 8, 45),
              },
            ],
          },
        ];
      case 1:
        return [
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
      default:
        return [
          {
            id: 'orbit-sw-bracket',
            primitives: [
              {
                kind: 'polyline',
                points: [
                  polarPoint(rOuter - 10, 158),
                  polarPoint(rOuter - 4, 135),
                  polarPoint(rMid - 6, 135),
                  polarPoint(rMid + 8, 114),
                ],
              },
            ],
          },
          {
            id: 'orbit-ne-bracket',
            primitives: [
              {
                kind: 'polyline',
                points: [
                  polarPoint(rOuter - 10, 338),
                  polarPoint(rOuter - 4, 315),
                  polarPoint(rMid - 6, 315),
                  polarPoint(rMid + 8, 294),
                ],
              },
            ],
          },
        ];
    }
  }

  return [225, 315, 135, 45].map((deg, idx) => ({
    id: `octant-${idx}`,
    primitives: [
      {
        kind: 'polyline',
        points: [
          polarPoint(rOuter - 16, deg - 28),
          polarPoint(rOuter - 6, deg),
          polarPoint(rMid - 6, deg),
        ],
      },
    ],
  }));
}

function buildCardinalFamily(
  rng: SeededRng,
  targetPieceCount: 6 | 7 | 8 | 9,
  r: RingRadii
): RawPieceBlueprint[] {
  const zenith = buildCardinalZenith(rng.nextInt(0, 19), r);
  const nadir = buildCardinalNadir(rng.nextInt(0, 19), r);
  const wings = buildCardinalWings(rng.nextInt(0, 15), r);

  if (targetPieceCount === 6) {
    return [
      ...buildCoreSingle(rng.nextInt(0, 17), r),
      zenith,
      nadir,
      ...wings,
      ...buildCardinalOrbitals(1, rng.nextInt(0, 11), r),
    ];
  }
  if (targetPieceCount === 7) {
    return [
      ...buildCoreSingle(rng.nextInt(0, 17), r),
      zenith,
      nadir,
      ...wings,
      ...buildCardinalOrbitals(2, rng.nextInt(0, 11), r),
    ];
  }
  if (targetPieceCount === 8) {
    return [
      ...buildCorePair(rng.nextInt(0, 11), r, 0),
      zenith,
      nadir,
      ...wings,
      ...buildCardinalOrbitals(2, rng.nextInt(0, 11), r),
    ];
  }
  return [
    ...buildCoreSingle(rng.nextInt(0, 17), r),
    zenith,
    nadir,
    ...wings,
    ...buildCardinalOrbitals(4, rng.nextInt(0, 11), r),
  ];
}

// ============================================================================
// FAMILY 1: DIAGONAL SALTIRE LOOM (X-Cross at 45/135/225/315 + Cardinal Crowns)
// ============================================================================

function buildSaltireArm(
  id: string,
  angleDeg: number,
  style: number,
  r: RingRadii
): RawPieceBlueprint {
  const { rInner, rMid, rOuter } = r;
  switch (style % 3) {
    case 0:
      // Barbed X-lance
      return {
        id,
        primitives: [
          {
            kind: 'line',
            from: polarPoint(rInner + 6, angleDeg),
            to: polarPoint(rOuter, angleDeg),
          },
          {
            kind: 'polyline',
            points: [
              polarPoint(rMid + 10, angleDeg - 22),
              polarPoint(rOuter, angleDeg),
              polarPoint(rMid + 10, angleDeg + 22),
            ],
          },
        ],
      };
    case 1:
      // Asymmetric runic hook
      return {
        id,
        primitives: [
          {
            kind: 'polyline',
            points: [
              polarPoint(rInner + 8, angleDeg),
              polarPoint(rOuter - 2, angleDeg),
              polarPoint(rOuter - 12, angleDeg + 28),
              polarPoint(rMid + 4, angleDeg + 16),
            ],
          },
        ],
      };
    default:
      // Forked tuning-prong diagonal
      return {
        id,
        primitives: [
          {
            kind: 'line',
            from: polarPoint(rInner + 6, angleDeg),
            to: polarPoint(rMid + 4, angleDeg),
          },
          {
            kind: 'polyline',
            points: [
              polarPoint(rOuter - 2, angleDeg - 18),
              polarPoint(rMid + 4, angleDeg),
              polarPoint(rOuter - 2, angleDeg + 18),
            ],
          },
        ],
      };
  }
}

function buildSaltireCardinalBridge(
  id: string,
  cardinalDeg: number,
  r: RingRadii
): RawPieceBlueprint {
  const { rMid, rOuter } = r;
  return {
    id,
    primitives: [
      {
        kind: 'arc',
        center: C,
        radius: rOuter - 8,
        startAngleDeg: normDeg(cardinalDeg - 27),
        sweepAngleDeg: 54,
      },
      {
        kind: 'line',
        from: polarPoint(rOuter - 8, cardinalDeg),
        to: polarPoint(rMid - 4, cardinalDeg),
      },
    ],
  };
}

function buildSaltireFamily(
  rng: SeededRng,
  targetPieceCount: 6 | 7 | 8 | 9,
  r: RingRadii
): RawPieceBlueprint[] {
  const armStyleA = rng.nextInt(0, 8);
  const armStyleB = rng.nextInt(0, 8);
  const diagonals: RawPieceBlueprint[] = [
    buildSaltireArm('saltire-nw', -135, armStyleA, r),
    buildSaltireArm('saltire-se', 45, armStyleA, r),
    buildSaltireArm('saltire-ne', -45, armStyleB, r),
    buildSaltireArm('saltire-sw', 135, armStyleB, r),
  ];

  if (targetPieceCount === 6) {
    const crownDeg = rng.nextInt(0, 1) === 0 ? -90 : 90;
    return [
      ...buildCoreSingle(rng.nextInt(0, 17), r),
      ...diagonals,
      buildSaltireCardinalBridge('saltire-crown', crownDeg, r),
    ];
  }

  if (targetPieceCount === 7) {
    const useVertical = rng.nextInt(0, 1) === 0;
    return [
      ...buildCoreSingle(rng.nextInt(0, 17), r),
      ...diagonals,
      buildSaltireCardinalBridge(
        'saltire-bridge-a',
        useVertical ? -90 : 180,
        r
      ),
      buildSaltireCardinalBridge('saltire-bridge-b', useVertical ? 90 : 0, r),
    ];
  }

  if (targetPieceCount === 8) {
    // Split core along N/S (-90/90) while outer bridges sit at E/W (180/0) for wide separation
    return [
      ...buildCorePair(rng.nextInt(0, 11), r, 90),
      ...diagonals,
      buildSaltireCardinalBridge('saltire-bridge-w', 180, r),
      buildSaltireCardinalBridge('saltire-bridge-e', 0, r),
    ];
  }

  return [
    ...buildCoreSingle(rng.nextInt(0, 17), r),
    ...diagonals,
    buildSaltireCardinalBridge('saltire-bridge-n', -90, r),
    buildSaltireCardinalBridge('saltire-bridge-s', 90, r),
    buildSaltireCardinalBridge('saltire-bridge-w', 180, r),
    buildSaltireCardinalBridge('saltire-bridge-e', 0, r),
  ];
}

// ============================================================================
// FAMILY 2: TRI-RADIAL 120° CELESTIAL STAR (3-Fold Y-Symmetry / Hexagonal)
// ============================================================================

function buildTriStarArm(
  id: string,
  angleDeg: number,
  style: number,
  r: RingRadii
): RawPieceBlueprint {
  const { rInner, rMid, rOuter } = r;
  switch (style % 3) {
    case 0:
      return {
        id,
        primitives: [
          {
            kind: 'line',
            from: polarPoint(rInner + 6, angleDeg),
            to: polarPoint(rOuter, angleDeg),
          },
          {
            kind: 'polyline',
            points: [
              polarPoint(rMid + 6, angleDeg - 26),
              polarPoint(rOuter, angleDeg),
              polarPoint(rMid + 6, angleDeg + 26),
            ],
          },
        ],
      };
    case 1:
      return {
        id,
        primitives: [
          {
            kind: 'polyline',
            points: [
              polarPoint(rInner + 8, angleDeg),
              polarPoint(rOuter - 4, angleDeg),
              polarPoint(rMid + 14, angleDeg + 28),
              polarPoint(rMid - 2, angleDeg),
            ],
          },
        ],
      };
    default:
      return {
        id,
        primitives: [
          {
            kind: 'polyline',
            points: [
              polarPoint(rOuter - 4, angleDeg - 20),
              polarPoint(rMid, angleDeg),
              polarPoint(rOuter - 4, angleDeg + 20),
            ],
          },
          {
            kind: 'line',
            from: polarPoint(rInner + 6, angleDeg),
            to: polarPoint(rMid, angleDeg),
          },
        ],
      };
  }
}

function buildTriStarOuterBridge(
  id: string,
  gapDeg: number,
  style: number,
  r: RingRadii
): RawPieceBlueprint {
  const { rMid, rOuter } = r;
  if (style % 2 === 0) {
    return {
      id,
      primitives: [
        {
          kind: 'arc',
          center: C,
          radius: rOuter - 8,
          startAngleDeg: normDeg(gapDeg - 34),
          sweepAngleDeg: 68,
        },
        {
          kind: 'line',
          from: polarPoint(rOuter - 8, gapDeg),
          to: polarPoint(rMid + 4, gapDeg),
        },
      ],
    };
  }
  return {
    id,
    primitives: [
      {
        kind: 'polyline',
        points: [
          polarPoint(rOuter - 12, gapDeg - 34),
          polarPoint(rOuter - 2, gapDeg),
          polarPoint(rOuter - 12, gapDeg + 34),
        ],
      },
      {
        kind: 'line',
        from: polarPoint(rOuter - 2, gapDeg),
        to: polarPoint(rMid + 6, gapDeg),
      },
    ],
  };
}

function buildTriStarFamily(
  rng: SeededRng,
  targetPieceCount: 6 | 7 | 8 | 9,
  r: RingRadii
): RawPieceBlueprint[] {
  const baseDeg = rng.nextInt(0, 1) === 0 ? -90 : 90;
  const armStyle = rng.nextInt(0, 8);
  const bridgeStyle = rng.nextInt(0, 7);

  const armAngles = [baseDeg, baseDeg + 120, baseDeg + 240] as const;
  const gapAngles = [baseDeg + 60, baseDeg + 180, baseDeg + 300] as const;

  const arms = armAngles.map((deg, idx) =>
    buildTriStarArm(`tristar-arm-${idx}`, deg, armStyle, r)
  );

  if (targetPieceCount === 6) {
    return [
      ...buildCoreSingle(rng.nextInt(0, 1) === 0 ? 3 : 5, r),
      ...arms,
      buildTriStarOuterBridge('tristar-arc-0', gapAngles[0], bridgeStyle, r),
      buildTriStarOuterBridge('tristar-arc-2', gapAngles[2], bridgeStyle, r),
    ];
  }

  const allThreeBridges = gapAngles.map((deg, idx) =>
    buildTriStarOuterBridge(`tristar-arc-${idx}`, deg, bridgeStyle, r)
  );

  if (targetPieceCount === 7) {
    return [
      ...buildCoreSingle(rng.nextInt(0, 1) === 0 ? 3 : 5, r),
      ...arms,
      ...allThreeBridges,
    ];
  }

  if (targetPieceCount === 8) {
    return [
      ...buildCorePair(rng.nextInt(0, 11), r, baseDeg + 90),
      ...arms,
      ...allThreeBridges,
    ];
  }

  // 9 pieces: 3 inner star petals + 3 primary star arms + 3 outer bridges
  const innerPetals: RawPieceBlueprint[] = gapAngles.map((deg, idx) => ({
    id: `tristar-petal-${idx}`,
    primitives: [
      {
        kind: 'polyline',
        points: [
          polarPoint(r.rInner + 12, deg - 38),
          polarPoint(22, deg),
          polarPoint(r.rInner + 12, deg + 38),
        ],
      },
      {
        kind: 'line',
        from: polarPoint(22, deg),
        to: polarPoint(r.rMid - 12, deg),
      },
    ],
  }));

  return [...innerPetals, ...arms, ...allThreeBridges];
}

// ============================================================================
// FAMILY 3: SOVEREIGN SEXTANT & CELESTIAL KEY (Asymmetric Polar Instrument)
// ============================================================================

function buildSextantKeyFamily(
  rng: SeededRng,
  targetPieceCount: 6 | 7 | 8 | 9,
  r: RingRadii
): RawPieceBlueprint[] {
  const { rInner, rMid, rOuter } = r;
  const orientations = [-90, -45, 0, 45] as const;
  const axisDeg = orientations[rng.nextInt(0, orientations.length - 1)]!;
  const oppDeg = axisDeg + 180;

  const core = buildCoreSingle(rng.nextInt(0, 17), r)[0]!;

  // Sweeping crown canopy arc
  const canopy: RawPieceBlueprint = {
    id: 'sextant-canopy',
    primitives: [
      {
        kind: 'arc',
        center: C,
        radius: rOuter - 4,
        startAngleDeg: normDeg(axisDeg - 52),
        sweepAngleDeg: 104,
      },
      {
        kind: 'line',
        from: polarPoint(rOuter - 4, axisDeg),
        to: polarPoint(rMid + 10, axisDeg),
      },
    ],
  };

  // Opposite polar key shaft with asymmetric key-bit teeth
  const bitSide = rng.nextInt(0, 1) === 0 ? 1 : -1;
  const shaft: RawPieceBlueprint = {
    id: 'sextant-shaft',
    primitives: [
      {
        kind: 'line',
        from: polarPoint(rInner + 6, oppDeg),
        to: polarPoint(rOuter, oppDeg),
      },
      {
        kind: 'line',
        from: polarPoint(rOuter - 6, oppDeg),
        to: polarPoint(rOuter - 6, oppDeg + bitSide * 22),
      },
      {
        kind: 'line',
        from: polarPoint(rMid + 10, oppDeg),
        to: polarPoint(rMid + 10, oppDeg + bitSide * 20),
      },
    ],
  };

  const strutLeft: RawPieceBlueprint = {
    id: 'sextant-strut-l',
    primitives: [
      {
        kind: 'polyline',
        points: [
          polarPoint(rInner + 8, axisDeg - 76),
          polarPoint(rOuter - 6, axisDeg - 76),
          polarPoint(rMid + 12, axisDeg - 98),
        ],
      },
    ],
  };

  const strutRight: RawPieceBlueprint = {
    id: 'sextant-strut-r',
    primitives: [
      {
        kind: 'polyline',
        points: [
          polarPoint(rInner + 8, axisDeg + 76),
          polarPoint(rOuter - 6, axisDeg + 76),
          polarPoint(rMid + 12, axisDeg + 98),
        ],
      },
    ],
  };

  const vernierArc: RawPieceBlueprint = {
    id: 'sextant-vernier',
    primitives: [
      {
        kind: 'arc',
        center: C,
        radius: rMid - 12,
        startAngleDeg: normDeg(axisDeg - 48),
        sweepAngleDeg: 96,
      },
    ],
  };

  const lowerScales: RawPieceBlueprint[] = [-130, 130].map((offset, idx) => ({
    id: `sextant-scale-${idx}`,
    primitives: [
      {
        kind: 'arc',
        center: C,
        radius: rOuter - 10,
        startAngleDeg: normDeg(axisDeg + offset - 25),
        sweepAngleDeg: 50,
      },
      {
        kind: 'line',
        from: polarPoint(rOuter - 10, axisDeg + offset),
        to: polarPoint(rMid, axisDeg + offset),
      },
    ],
  }));

  const baseFive = [core, canopy, shaft, strutLeft, strutRight];

  if (targetPieceCount === 6) {
    return [...baseFive, vernierArc];
  }
  if (targetPieceCount === 7) {
    return [...baseFive, ...lowerScales];
  }
  if (targetPieceCount === 8) {
    return [...baseFive, vernierArc, ...lowerScales];
  }

  const shoulderWards: RawPieceBlueprint[] = [-38, 38].map((offset, idx) => ({
    id: `sextant-ward-${idx}`,
    primitives: [
      {
        kind: 'polyline',
        points: [
          polarPoint(rMid + 4, axisDeg + offset - 18),
          polarPoint(rInner + 16, axisDeg + offset),
          polarPoint(rMid + 16, axisDeg + offset),
        ],
      },
    ],
  }));

  return [...baseFive, ...lowerScales, ...shoulderWards];
}

function selectFamilyIndex(seed: string, attempt: number, rng: SeededRng): number {
  const dailyMatch = /^sigil:v1:(\d{4}-\d{2}-\d{2}):(daily|bonus-1|bonus-2)$/.exec(
    seed
  );
  if (dailyMatch) {
    const edition = getEditionNumber(dailyMatch[1]!);
    const variant = dailyMatch[2]!;
    const modeOffset =
      variant === 'daily' ? 0 : variant === 'bonus-1' ? 1 : 2;
    return (edition + modeOffset + attempt) % 4;
  }

  const preludeMatch = /^sigil:v1:prelude:prelude-(\d+)$/.exec(seed);
  if (preludeMatch) {
    return (Number(preludeMatch[1]) + attempt) % 4;
  }

  return (rng.nextInt(0, 3) + attempt) % 4;
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
 * and target piece count in [6, 9], with 100% server/client title synchronization.
 */
export function synthesizeCalibratedSigil(
  seed: string,
  targetPieceCount: 6 | 7 | 8 | 9,
  idPrefix: string = 'sigil'
): CompiledSigilPuzzle {
  // Title is resolved directly from `seed` outside the retry loop so it never drifts!
  const { name, subtitle } = resolveSigilIdentity(seed);

  for (let attempt = 0; attempt < 12; attempt++) {
    const attemptSeed = attempt === 0 ? seed : `${seed}:retry:${attempt}`;
    const rng = createSeededRng(attemptSeed);

    const radii: RingRadii = {
      rInner: rng.nextInt(32, 38),
      rMid: rng.nextInt(68, 75),
      rOuter: rng.nextInt(112, 120),
    };

    const familyIdx = selectFamilyIndex(seed, attempt, rng);
    let pieces: RawPieceBlueprint[];

    switch (familyIdx) {
      case 1:
        pieces = buildSaltireFamily(rng, targetPieceCount, radii);
        break;
      case 2:
        pieces = buildTriStarFamily(rng, targetPieceCount, radii);
        break;
      case 3:
        pieces = buildSextantKeyFamily(rng, targetPieceCount, radii);
        break;
      default:
        pieces = buildCardinalFamily(rng, targetPieceCount, radii);
        break;
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

  const stdRadii: RingRadii = { rInner: 36, rMid: 72, rOuter: 116 };
  const fallbackRng = createSeededRng(`${seed}:fallback`);
  return compileSigilBlueprint({
    id: `${idPrefix}-safe`,
    name,
    subtitle,
    pieces: buildCardinalFamily(fallbackRng, targetPieceCount, stdRadii),
  });
}