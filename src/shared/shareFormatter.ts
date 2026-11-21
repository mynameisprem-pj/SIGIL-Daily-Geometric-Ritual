import type { GameMode, ScoreBreakdown } from './types';

export interface ShareCardPayload {
  readonly mode: GameMode;
  readonly edition: number;
  readonly sigilName: string;
  readonly pieceCount: number;
  readonly moves: number;
  readonly elapsedMs: number;
  readonly score: ScoreBreakdown;
  readonly streak?: number;
  readonly percentile?: number | null;
}

export function formatClockDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getModeHeaderTag(mode: GameMode, edition: number): string {
  const ed = `#${String(edition).padStart(3, '0')}`;
  switch (mode) {
    case 'daily':
      return `SIGIL ${ed}`;
    case 'bonus-1':
      return `SIGIL ${ed} · Bonus I`;
    case 'bonus-2':
      return `SIGIL ${ed} · Bonus II`;
    case 'practice':
      return `SIGIL ${ed} · Archive`;
    case 'zen':
      return `SIGIL · Zen #${edition}`;
  }
}

/**
 * Generates a crisp, spoiler-free plain-text dispatch for clipboard sharing.
 */
export function buildShareDispatchText(payload: ShareCardPayload): string {
  const clampedPieces = Math.max(
    1,
    Math.min(12, Math.floor(payload.pieceCount))
  );
  const glyphBar = '◈'.repeat(clampedPieces);
  const header = `${getModeHeaderTag(payload.mode, payload.edition)} — ${payload.sigilName}`;

  const sealLine = payload.score.isPerfect
    ? `${glyphBar} Perfect Reconstruction (Jade Seal)`
    : `${glyphBar} ${payload.score.gradeLabel}`;

  if (payload.mode === 'zen') {
    return [header, sealLine, `${payload.moves} moves · Meditative Flow`].join(
      '\n'
    );
  }

  const metrics: string[] = [
    `${payload.score.totalScore.toLocaleString('en-US')} pts`,
    `${payload.moves} moves`,
    formatClockDurationMs(payload.elapsedMs),
  ];

  if (
    payload.mode === 'daily' &&
    typeof payload.percentile === 'number' &&
    payload.percentile > 0
  ) {
    metrics.push(`Top ${Math.max(1, Math.round(payload.percentile))}%`);
  }

  if (
    payload.mode === 'daily' &&
    typeof payload.streak === 'number' &&
    payload.streak > 0
  ) {
    metrics.push(`${payload.streak}d streak`);
  }

  return [header, sealLine, metrics.join(' · ')].join('\n');
}

/**
 * Generates a spoiler-free Reddit Markdown comment reply for the Daily Ritual Ledger.
 */
export function buildRedditMarkdownComment(payload: ShareCardPayload): string {
  const clampedPieces = Math.max(
    1,
    Math.min(12, Math.floor(payload.pieceCount))
  );
  const glyphBar = '◈'.repeat(clampedPieces);
  const header = `**${getModeHeaderTag(payload.mode, payload.edition)} — ${payload.sigilName}**`;

  const sealLine = payload.score.isPerfect
    ? `\`${glyphBar}\` **Jade Seal** · Perfect Reconstruction`
    : `\`${glyphBar}\` ${payload.score.gradeLabel}`;

  if (payload.mode === 'zen') {
    return [header, sealLine, `${payload.moves} moves · Meditative Flow`].join(
      '  \n'
    );
  }

  const metrics: string[] = [
    `**${payload.score.totalScore.toLocaleString('en-US')} pts**`,
    `${payload.moves} moves`,
    `\`${formatClockDurationMs(payload.elapsedMs)}\``,
  ];

  if (
    payload.mode === 'daily' &&
    typeof payload.percentile === 'number' &&
    payload.percentile > 0
  ) {
    metrics.push(`Top ${Math.max(1, Math.round(payload.percentile))}%`);
  }

  if (
    payload.mode === 'daily' &&
    typeof payload.streak === 'number' &&
    payload.streak > 0
  ) {
    metrics.push(`${payload.streak}d streak`);
  }

  return [header, sealLine, metrics.join(' · ')].join('  \n');
}

/**
 * Formats a subtle, high-craft subreddit prestige flair reflecting daily streak & Jade mastery.
 */
export function formatPrestigeUserFlair(
  streak: number,
  perfectCount: number
): string {
  const safeStreak = Math.max(0, Math.floor(streak));
  const safePerfect = Math.max(0, Math.floor(perfectCount));

  if (safePerfect > 0 && safeStreak > 0) {
    return `◈ Grand Lapidary · ${safeStreak}d`;
  }
  if (safePerfect > 0) {
    return `◈ Jade Engraver · ${safePerfect}`;
  }
  if (safeStreak >= 7) {
    return `◇ Master Scribe · ${safeStreak}d`;
  }
  return `◇ Sigil Scribe · ${Math.max(1, safeStreak)}d`;
}