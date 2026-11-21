import { SANCTUM_CENTER } from '../../shared/constants';
import type { CompiledSigilPuzzle, RawSigilBlueprint } from '../../shared/types';
import { compileSigilBlueprint, polarPoint } from './geometry';

const C = { x: SANCTUM_CENTER, y: SANCTUM_CENTER };

/**
 * Sigil I — "Solar Astrolabe" (7 pieces)
 * Features:
 * - Asymmetric zenith hook, circular lunar cradle arcs, 2-fold central axis spine,
 *   and congruent east/west wing chevrons (tests interchangeable congruent slot snapping!).
 */
const SOLAR_ASTROLABE_RAW: RawSigilBlueprint = {
  id: 'sigil-proto-astrolabe',
  name: 'Solar Astrolabe',
  subtitle: 'Order of the Vernal Meridian',
  pieces: [
    {
      id: 'zenith-crown',
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(74, -135),
            polarPoint(116, -90),
            polarPoint(74, -45),
          ],
        },
        {
          kind: 'line',
          from: polarPoint(116, -90),
          to: polarPoint(52, -90),
        },
      ],
    },
    {
      id: 'meridian-spine',
      // Pure 180-deg symmetric central spine with crossbar
      primitives: [
        {
          kind: 'line',
          from: { x: C.x, y: C.y - 52 },
          to: { x: C.x, y: C.y + 52 },
        },
        {
          kind: 'line',
          from: { x: C.x - 26, y: C.y },
          to: { x: C.x + 26, y: C.y },
        },
      ],
    },
    {
      id: 'west-wing',
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(62, 225),
            polarPoint(112, 180),
            polarPoint(62, 135),
          ],
        },
      ],
    },
    {
      id: 'east-wing',
      // Congruent to west-wing rotated by 180 deg!
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(62, -45),
            polarPoint(112, 0),
            polarPoint(62, 45),
          ],
        },
      ],
    },
    {
      id: 'upper-halo-arc',
      primitives: [
        {
          kind: 'arc',
          center: C,
          radius: 92,
          startAngleDeg: 205,
          sweepAngleDeg: 130,
        },
      ],
    },
    {
      id: 'lower-cradle-arc',
      primitives: [
        {
          kind: 'arc',
          center: C,
          radius: 92,
          startAngleDeg: 25,
          sweepAngleDeg: 130,
        },
        {
          kind: 'line',
          from: polarPoint(92, 90),
          to: polarPoint(120, 90),
        },
      ],
    },
    {
      id: 'nadir-anchor',
      primitives: [
        {
          kind: 'polyline',
          points: [
            { x: C.x - 34, y: C.y + 52 },
            { x: C.x, y: C.y + 92 },
            { x: C.x + 34, y: C.y + 52 },
          ],
        },
        {
          kind: 'line',
          from: { x: C.x + 34, y: C.y + 52 },
          to: { x: C.x + 34, y: C.y + 24 },
        },
      ],
    },
  ],
};

/**
 * Sigil II — "Valkyrie Compass" (6 pieces)
 * Clean, crisp 6-piece geometric rune ideal for sub-3-second onboarding & rapid flow testing.
 */
const VALKYRIE_COMPASS_RAW: RawSigilBlueprint = {
  id: 'sigil-proto-compass',
  name: 'Valkyrie Compass',
  subtitle: 'Sixfold Wayfinder Seal',
  pieces: [
    {
      id: 'core-diamond',
      // 4-fold symmetric inner square/diamond (valid at 0, 90, 180, 270!)
      primitives: [
        {
          kind: 'polyline',
          closed: true,
          points: [
            { x: C.x, y: C.y - 38 },
            { x: C.x + 38, y: C.y },
            { x: C.x, y: C.y + 38 },
            { x: C.x - 38, y: C.y },
          ],
        },
      ],
    },
    {
      id: 'north-spear',
      primitives: [
        {
          kind: 'line',
          from: { x: C.x, y: C.y - 38 },
          to: { x: C.x, y: C.y - 118 },
        },
        {
          kind: 'polyline',
          points: [
            { x: C.x - 24, y: C.y - 88 },
            { x: C.x, y: C.y - 118 },
            { x: C.x + 24, y: C.y - 88 },
          ],
        },
      ],
    },
    {
      id: 'south-keel',
      primitives: [
        {
          kind: 'line',
          from: { x: C.x, y: C.y + 38 },
          to: { x: C.x, y: C.y + 114 },
        },
        {
          kind: 'line',
          from: { x: C.x - 28, y: C.y + 84 },
          to: { x: C.x + 28, y: C.y + 84 },
        },
      ],
    },
    {
      id: 'nw-arc-horn',
      primitives: [
        {
          kind: 'arc',
          center: C,
          radius: 88,
          startAngleDeg: 165,
          sweepAngleDeg: 85,
        },
        {
          kind: 'line',
          from: polarPoint(88, 165),
          to: polarPoint(52, 180),
        },
      ],
    },
    {
      id: 'ne-arc-horn',
      primitives: [
        {
          kind: 'arc',
          center: C,
          radius: 88,
          startAngleDeg: 290,
          sweepAngleDeg: 85,
        },
        {
          kind: 'line',
          from: polarPoint(88, 15),
          to: polarPoint(52, 0),
        },
      ],
    },
    {
      id: 'southern-horizon-bow',
      primitives: [
        {
          kind: 'arc',
          center: C,
          radius: 68,
          startAngleDeg: 35,
          sweepAngleDeg: 110,
        },
      ],
    },
  ],
};

/**
 * Sigil III — "Obsidian Loom" (8 pieces)
 * Higher-density octagram/runic weave testing tight piece proximity & locked-layer ordering.
 */
const OBSIDIAN_LOOM_RAW: RawSigilBlueprint = {
  id: 'sigil-proto-loom',
  name: 'Obsidian Loom',
  subtitle: 'Harmonic Octagram Weave',
  pieces: [
    {
      id: 'inner-ring-west',
      primitives: [
        {
          kind: 'arc',
          center: C,
          radius: 46,
          startAngleDeg: 110,
          sweepAngleDeg: 140,
        },
        {
          kind: 'line',
          from: polarPoint(46, 180),
          to: polarPoint(96, 180),
        },
      ],
    },
    {
      id: 'inner-ring-east',
      primitives: [
        {
          kind: 'arc',
          center: C,
          radius: 46,
          startAngleDeg: 290,
          sweepAngleDeg: 140,
        },
        {
          kind: 'line',
          from: polarPoint(46, 0),
          to: polarPoint(96, 0),
        },
      ],
    },
    {
      id: 'crown-triad',
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(96, 225),
            polarPoint(118, 270),
            polarPoint(96, 315),
          ],
        },
        {
          kind: 'line',
          from: polarPoint(46, 270),
          to: polarPoint(118, 270),
        },
      ],
    },
    {
      id: 'root-triad',
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(96, 135),
            polarPoint(118, 90),
            polarPoint(96, 45),
          ],
        },
        {
          kind: 'line',
          from: polarPoint(46, 90),
          to: polarPoint(118, 90),
        },
      ],
    },
    {
      id: 'nw-chord-hook',
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(96, 180),
            polarPoint(96, 225),
            polarPoint(62, 225),
          ],
        },
      ],
    },
    {
      id: 'ne-chord-hook',
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(96, 0),
            polarPoint(96, 315),
            polarPoint(62, 315),
          ],
        },
      ],
    },
    {
      id: 'sw-chord-hook',
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(96, 180),
            polarPoint(96, 135),
            polarPoint(62, 135),
          ],
        },
      ],
    },
    {
      id: 'se-chord-hook',
      primitives: [
        {
          kind: 'polyline',
          points: [
            polarPoint(96, 0),
            polarPoint(96, 45),
            polarPoint(62, 45),
          ],
        },
      ],
    },
  ],
};

export const PROTOTYPE_SIGILS: readonly CompiledSigilPuzzle[] = [
  compileSigilBlueprint(VALKYRIE_COMPASS_RAW),
  compileSigilBlueprint(SOLAR_ASTROLABE_RAW),
  compileSigilBlueprint(OBSIDIAN_LOOM_RAW),
];