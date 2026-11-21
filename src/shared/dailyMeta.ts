import { getEditionNumber, getUtcDayOfWeek } from './constants';

const LAUNCH_SIGIL_NAMES = [
  'Valkyrie Compass',
  'Solar Astrolabe',
  'Obsidian Loom',
] as const;

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

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nextMulberry(state: { s: number }): number {
  state.s = (state.s + 0x6d2b79f5) | 0;
  let t = Math.imul(state.s ^ (state.s >>> 15), 1 | state.s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function nextInt(state: { s: number }, min: number, max: number): number {
  return min + Math.floor(nextMulberry(state) * (max - min + 1));
}

export function resolveDailyPostSummary(dateKey: string): {
  edition: number;
  editionTag: string;
  pieceCount: 6 | 7 | 8;
  sigilName: string;
  postTitle: string;
} {
  const edition = getEditionNumber(dateKey);
  const editionTag = `#${String(edition).padStart(3, '0')}`;

  if (edition >= 1 && edition <= LAUNCH_SIGIL_NAMES.length) {
    const sigilName = LAUNCH_SIGIL_NAMES[edition - 1]!;
    const launchCounts: readonly (6 | 7 | 8)[] = [6, 7, 8];
    const pieceCount = launchCounts[edition - 1] ?? 6;
    return {
      edition,
      editionTag,
      pieceCount,
      sigilName,
      postTitle: `Sigil ${editionTag} — ${sigilName} (${pieceCount} Strokes)`,
    };
  }

  const dow = getUtcDayOfWeek(dateKey);
  const pieceCount: 6 | 7 | 8 =
    dow === 1 || dow === 2 ? 6 : dow === 3 || dow === 4 || dow === 5 ? 7 : 8;

  const state = { s: hashSeed(`sigil:v1:${dateKey}:daily`) };
  // Consume the 3 ring-radius RNG steps to match client generator title sequence
  nextInt(state, 32, 40);
  nextInt(state, 68, 76);
  nextInt(state, 112, 120);

  const adj = ADJECTIVES[nextInt(state, 0, ADJECTIVES.length - 1)]!;
  const noun = ARTIFACTS[nextInt(state, 0, ARTIFACTS.length - 1)]!;
  const sigilName = `${adj} ${noun}`;

  return {
    edition,
    editionTag,
    pieceCount,
    sigilName,
    postTitle: `Sigil ${editionTag} — ${sigilName} (${pieceCount} Strokes)`,
  };
}