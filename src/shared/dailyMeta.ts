import { getEditionNumber, getUtcDayOfWeek } from './constants';

const LAUNCH_SIGIL_NAMES = [
  'Valkyrie Compass',
  'Solar Astrolabe',
  'Obsidian Loom',
] as const;

const LAUNCH_SUBTITLES = [
  'Order of the First Meridian',
  'Sanctum of the Quiet Sun',
  'Harmonic Basalt Archive',
] as const;

// Preserves exact published Reddit post names for Editions #004 and #005 ("Zenith Covenant")
const LEGACY_ADJECTIVES = [
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

const LEGACY_ARTIFACTS = [
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

// 25 Adjectives x 24 Artifacts (gcd(25, 24) = 1 => 600-day bijection with zero repeats)
const ADJECTIVES_25 = [
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
  'Gilded',
  'Lunar',
  'Crimson',
  'Sovereign',
  'Radiant',
  'Cobalt',
  'Empyrean',
  'Verdant',
  'Arcane',
] as const;

const ARTIFACTS_24 = [
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
  'Prism',
  'Orrery',
  'Sanctum',
  'Talisman',
  'Beacon',
  'Dial',
  'Aegis',
  'Pendulum',
  'Crest',
  'Cipher',
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

function pickBijectiveIdentity(slot: number): {
  name: string;
  subtitle: string;
} {
  const safeSlot = ((slot % 600) + 600) % 600;
  // gcd(7, 25) = 1 and gcd(11, 24) = 1 => 600 unique names, zero consecutive adj/noun repeats
  const adjIdx = (safeSlot * 7 + 3) % ADJECTIVES_25.length;
  const nounIdx = (safeSlot * 11 + 5) % ARTIFACTS_24.length;
  const orderIdx = (safeSlot * 3 + 1) % ORDERS.length;
  return {
    name: `${ADJECTIVES_25[adjIdx]!} ${ARTIFACTS_24[nounIdx]!}`,
    subtitle: ORDERS[orderIdx]!,
  };
}

/**
 * Single deterministic source of truth for Sigil names across server post titles
 * and client puzzle synthesis (immune to geometry quality-gate retries).
 */
export function resolveSigilIdentity(seed: string): {
  name: string;
  subtitle: string;
} {
  const dailyMatch = /^sigil:v1:(\d{4}-\d{2}-\d{2}):(daily|bonus-1|bonus-2)$/.exec(
    seed
  );

  if (dailyMatch) {
    const dateKey = dailyMatch[1]!;
    const variant = dailyMatch[2]!;
    const edition = getEditionNumber(dateKey);

    if (variant === 'daily') {
      if (edition >= 1 && edition <= LAUNCH_SIGIL_NAMES.length) {
        return {
          name: LAUNCH_SIGIL_NAMES[edition - 1]!,
          subtitle: LAUNCH_SUBTITLES[edition - 1]!,
        };
      }
      // Keep already-published Editions #004 and #005 ("Zenith Covenant") matched to live Reddit titles
      if (edition === 4 || edition === 5) {
        const state = { s: hashSeed(seed) };
        nextInt(state, 32, 40);
        nextInt(state, 68, 76);
        nextInt(state, 112, 120);
        const adj =
          LEGACY_ADJECTIVES[nextInt(state, 0, LEGACY_ADJECTIVES.length - 1)]!;
        const noun =
          LEGACY_ARTIFACTS[nextInt(state, 0, LEGACY_ARTIFACTS.length - 1)]!;
        const subtitle = ORDERS[nextInt(state, 0, ORDERS.length - 1)]!;
        return { name: `${adj} ${noun}`, subtitle };
      }
      return pickBijectiveIdentity(edition);
    }

    if (variant === 'bonus-1') {
      return pickBijectiveIdentity(edition + 200);
    }
    return pickBijectiveIdentity(edition + 400);
  }

  const preludeMatch = /^sigil:v1:prelude:prelude-(\d+)$/.exec(seed);
  if (preludeMatch) {
    return pickBijectiveIdentity(540 + Number(preludeMatch[1]));
  }

  return pickBijectiveIdentity(hashSeed(`${seed}:identity`) % 600);
}

// 20 varied daily post hooks cycled with coprime stride (gcd(7, 20) = 1 => 20 days without repeats)
const DAILY_TITLE_HOOKS: readonly ((
  sigilName: string,
  pieceCount: 6 | 7 | 8
) => string)[] = [
  (name, n) => `The ${name} lies in ${n} pieces — can you beat par?`,
  (name) => `Two minutes of calm geometry: Reconstruct the ${name}`,
  (name, n) => `${n} scattered strokes. One ${name}. Can you earn Jade?`,
  (name) => `Step up to the astrolabe — today's ${name} is live`,
  (name) => `Only clean moves forge a Jade Seal on the ${name}`,
  (name, n) => `Daily spatial ritual: Lock all ${n} strokes of the ${name}`,
  (name) => `Think you can solve the ${name} within +2 moves of par?`,
  (name, n) => `Rotate. Align. Snap. Today's ${n}-stroke ${name} awaits`,
  (name) => `Morning geometry check: How fast can you forge the ${name}?`,
  (name) => `Today's seal is shattered — piece together the ${name}`,
  (name, n) => `${name} (${n} Strokes) — Claim your spot on today's standings`,
  (name) => `Precision over speed: Can you master the ${name}?`,
  (name, n) => `Every stroke has a home. Reconstruct the ${n}-piece ${name}`,
  (name) => `A fresh astrolabe trial: Unlock Jade on the ${name}`,
  (name, n) => `Can you read the blueprint? ${n} strokes form the ${name}`,
  (name) => `Coffee & geometry: Take on today's ${name} challenge`,
  (name, n) => `${n} stone strokes stand between you and the ${name}`,
  (name) => `Put your spatial eye to the test on the ${name}`,
  (name) => `Beat the subreddit average on the shattered ${name}`,
  (name, n) => `Grand Astrolabe Trial: Assemble the ${n}-stroke ${name}`,
];

function formatChallengePostTitle(
  edition: number,
  editionTag: string,
  sigilName: string,
  pieceCount: 6 | 7 | 8
): string {
  if (edition <= 3) {
    return `Sigil ${editionTag} — Can you solve today's ${sigilName} challenge?`;
  }
  const hookIdx = (edition * 7) % DAILY_TITLE_HOOKS.length;
  const hookFn = DAILY_TITLE_HOOKS[hookIdx]!;
  return `Sigil ${editionTag} — ${hookFn(sigilName, pieceCount)}`;
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
    const launchCounts: readonly (6 | 7 | 8)[] = [6, 7, 8];
    const pieceCount = launchCounts[edition - 1] ?? 6;
    const { name: sigilName } = resolveSigilIdentity(
      `sigil:v1:${dateKey}:daily`
    );
    return {
      edition,
      editionTag,
      pieceCount,
      sigilName,
      postTitle: formatChallengePostTitle(
        edition,
        editionTag,
        sigilName,
        pieceCount
      ),
    };
  }

  const dow = getUtcDayOfWeek(dateKey);
  const pieceCount: 6 | 7 | 8 =
    dow === 1 || dow === 2 ? 6 : dow === 3 || dow === 4 || dow === 5 ? 7 : 8;

  const { name: sigilName } = resolveSigilIdentity(`sigil:v1:${dateKey}:daily`);

  return {
    edition,
    editionTag,
    pieceCount,
    sigilName,
    postTitle: formatChallengePostTitle(
      edition,
      editionTag,
      sigilName,
      pieceCount
    ),
  };
}