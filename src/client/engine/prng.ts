export interface SeededRng {
  /** Uniform float in [0, 1) */
  nextFloat(): number;
  /** Uniform integer in [minInclusive, maxInclusive] */
  nextInt(minInclusive: number, maxInclusive: number): number;
  /** Deterministic Fisher-Yates copy shuffle */
  shuffle<T>(items: readonly T[]): T[];
}

export function hashSeedString(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createSeededRng(seed: string | number): SeededRng {
  let state = typeof seed === 'number' ? seed >>> 0 : hashSeedString(seed);
  if (state === 0) state = 0x6d2b79f5;

  const nextFloat = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const nextInt = (minInclusive: number, maxInclusive: number): number => {
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(nextFloat() * span);
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = nextInt(0, i);
      const tmp = copy[i]!;
      copy[i] = copy[j]!;
      copy[j] = tmp;
    }
    return copy;
  };

  return { nextFloat, nextInt, shuffle };
}