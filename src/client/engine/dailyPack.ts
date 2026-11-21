import {
  getDateKeyForEdition,
  getEditionNumber,
  getUtcDayOfWeek,
} from '../../shared/constants';
import type {
  DailySigilPack,
  DifficultyTier,
  ScheduledPuzzleEntry,
} from '../../shared/types';
import { createSeededRng } from './prng';
import { PROTOTYPE_SIGILS } from './prototypeSigils';
import { synthesizeCalibratedSigil } from './sigilGenerator';

export function getTierMetadata(pieceCount: 6 | 7 | 8 | 9): {
  tier: DifficultyTier;
  tierLabel: string;
} {
  switch (pieceCount) {
    case 6:
      return { tier: 'flow', tierLabel: 'Initiate Flow · 6 Strokes' };
    case 7:
      return { tier: 'ritual', tierLabel: 'Measured Ritual · 7 Strokes' };
    case 8:
      return {
        tier: 'masterpiece',
        tierLabel: 'Grand Seal · 8 Strokes',
      };
    case 9:
      return {
        tier: 'ascendant',
        tierLabel: 'Ascendant Engraving · 9 Strokes',
      };
  }
}

/**
 * Calibrated weekly piece count for Main Daily:
 * - Mon (1), Tue (2): 6 pieces (Accessible start-of-week flow)
 * - Wed (3), Thu (4), Fri (5): 7 pieces (Balanced mid-week ritual)
 * - Sat (6), Sun (0): 8 pieces (Weekend showcase)
 */
export function getCalibratedMainPieceCount(dateKey: string): 6 | 7 | 8 {
  const dow = getUtcDayOfWeek(dateKey);
  if (dow === 1 || dow === 2) return 6;
  if (dow === 3 || dow === 4 || dow === 5) return 7;
  return 8;
}

export function buildDailySigilPack(dateKey: string): DailySigilPack {
  const edition = getEditionNumber(dateKey);
  const mainSeed = `sigil:v1:${dateKey}:daily`;
  const bonus1Seed = `sigil:v1:${dateKey}:bonus-1`;
  const bonus2Seed = `sigil:v1:${dateKey}:bonus-2`;

  // Editions 1..3 feature our handcrafted signature Sigils while respecting full seed determinism
  let mainPuzzle;
  let mainPieceCount: 6 | 7 | 8;

  if (edition >= 1 && edition <= PROTOTYPE_SIGILS.length) {
    mainPuzzle = PROTOTYPE_SIGILS[edition - 1]!;
    mainPieceCount = mainPuzzle.pieces.length as 6 | 7 | 8;
  } else {
    mainPieceCount = getCalibratedMainPieceCount(dateKey);
    mainPuzzle = synthesizeCalibratedSigil(
      mainSeed,
      mainPieceCount,
      `daily-${edition}`
    );
  }

  const mainMeta = getTierMetadata(mainPieceCount);

  // Bonus 1: Twin Aspect (7 or 8 pieces)
  const b1Rng = createSeededRng(bonus1Seed);
  const b1Count: 7 | 8 = b1Rng.nextInt(0, 1) === 0 ? 7 : 8;
  const bonus1Puzzle = synthesizeCalibratedSigil(
    bonus1Seed,
    b1Count,
    `bonus1-${edition}`
  );
  const b1Meta = getTierMetadata(b1Count);

  // Bonus 2: Master Engraving (8 or 9 pieces — always >= Bonus 1)
  const b2Count: 8 | 9 = mainPieceCount >= 8 || b1Count >= 8 ? 9 : 8;
  const bonus2Puzzle = synthesizeCalibratedSigil(
    bonus2Seed,
    b2Count,
    `bonus2-${edition}`
  );
  const b2Meta = getTierMetadata(b2Count);

  return {
    dateKey,
    edition,
    main: {
      mode: 'daily',
      dateKey,
      edition,
      seed: mainSeed,
      tier: mainMeta.tier,
      tierLabel: mainMeta.tierLabel,
      pieceCount: mainPuzzle.pieces.length,
      puzzle: mainPuzzle,
    },
    bonus1: {
      mode: 'bonus-1',
      dateKey,
      edition,
      seed: bonus1Seed,
      tier: b1Meta.tier,
      tierLabel: b1Meta.tierLabel,
      pieceCount: bonus1Puzzle.pieces.length,
      puzzle: bonus1Puzzle,
    },
    bonus2: {
      mode: 'bonus-2',
      dateKey,
      edition,
      seed: bonus2Seed,
      tier: b2Meta.tier,
      tierLabel: b2Meta.tierLabel,
      pieceCount: bonus2Puzzle.pieces.length,
      puzzle: bonus2Puzzle,
    },
  };
}

/** Reconstructs any historical edition for Practice Mode */
export function buildPracticeEntryByEdition(
  edition: number
): ScheduledPuzzleEntry {
  const dateKey = getDateKeyForEdition(edition);
  const pack = buildDailySigilPack(dateKey);
  return {
    ...pack.main,
    mode: 'practice',
  };
}

/** Generates an endless stream of meditative 6-8 piece Sigils for Zen Mode */
export function buildZenEntry(
  zenIndex: number,
  userSalt: string = 'wanderer'
): ScheduledPuzzleEntry {
  const safeIdx = Math.max(1, Math.floor(zenIndex));
  const seed = `sigil:v1:zen:${userSalt}:${safeIdx}`;
  const rng = createSeededRng(seed);
  const counts: readonly (6 | 7 | 8)[] = [6, 7, 7, 8];
  const pieceCount = counts[rng.nextInt(0, counts.length - 1)]!;
  const puzzle = synthesizeCalibratedSigil(seed, pieceCount, `zen-${safeIdx}`);
  const meta = getTierMetadata(pieceCount);

  return {
    mode: 'zen',
    dateKey: `ZEN-${String(safeIdx).padStart(3, '0')}`,
    edition: safeIdx,
    seed,
    tier: meta.tier,
    tierLabel: meta.tierLabel,
    pieceCount: puzzle.pieces.length,
    puzzle,
  };
}

export interface PracticeCatalogItem {
  readonly key: string;
  readonly label: string;
  readonly entry: ScheduledPuzzleEntry;
}

const PRELUDE_SEEDS: readonly {
  readonly code: string;
  readonly numeral: string;
  readonly pieces: 6 | 7 | 8;
}[] = [
  { code: 'prelude-1', numeral: 'I', pieces: 6 },
  { code: 'prelude-2', numeral: 'II', pieces: 6 },
  { code: 'prelude-3', numeral: 'III', pieces: 7 },
  { code: 'prelude-4', numeral: 'IV', pieces: 7 },
  { code: 'prelude-5', numeral: 'V', pieces: 8 },
];

export function buildPreludeEntry(preludeIndex: number): ScheduledPuzzleEntry {
  const spec =
    PRELUDE_SEEDS[
      Math.max(0, Math.min(PRELUDE_SEEDS.length - 1, preludeIndex))
    ]!;
  const seed = `sigil:v1:prelude:${spec.code}`;
  const puzzle = synthesizeCalibratedSigil(seed, spec.pieces, spec.code);
  const meta = getTierMetadata(spec.pieces);

  return {
    mode: 'practice',
    dateKey: `PRELUDE-${spec.numeral}`,
    edition: preludeIndex + 1,
    seed,
    tier: meta.tier,
    tierLabel: meta.tierLabel,
    pieceCount: puzzle.pieces.length,
    puzzle,
  };
}

/**
 * Builds the playable Practice Archive list:
 * - Up to 14 most recent past Daily Editions (#(currentEdition - 1) down to #1)
 * - Plus 5 curated Founders' Prelude Seals so Day-1 players & judges always have a rich archive.
 */
export function listPracticeCatalog(
  currentEdition: number
): PracticeCatalogItem[] {
  const items: PracticeCatalogItem[] = [];

  const minEdition = Math.max(1, currentEdition - 14);
  for (let ed = currentEdition - 1; ed >= minEdition; ed--) {
    const entry = buildPracticeEntryByEdition(ed);
    items.push({
      key: `ed-${ed}`,
      label: `Edition #${String(ed).padStart(3, '0')}`,
      entry,
    });
  }

  PRELUDE_SEEDS.forEach((spec, idx) => {
    const entry = buildPreludeEntry(idx);
    items.push({
      key: spec.code,
      label: `Prelude ${spec.numeral}`,
      entry,
    });
  });

  return items;
}