import { telemetry } from '@devvit/analytics/client/reddit';
import type { GameMode } from '../../shared/types';

let appReadySent = false;

export function notifyAppReadyOnce(): void {
  if (appReadySent) return;
  appReadySent = true;
  void telemetry.appReady().catch(() => {
    // Playtest or standalone Vite preview: ignore silently
  });
}

export async function ensureActiveJourney(
  mode: GameMode,
  edition: number
): Promise<void> {
  try {
    if (!telemetry.getActiveJourneyId()) {
      await telemetry.startJourney();
    }
    await telemetry.interaction({
      action: 'puzzle_loaded',
      actionDetails: `${mode}:ed_${edition}`,
    });
  } catch {
    // Never interrupt gameplay
  }
}

export function trackStrokeLockedProgress(
  lockedCount: number,
  totalCount: number,
  mode: GameMode
): void {
  if (totalCount <= 0) return;
  const ratio = Math.max(0, Math.min(1, lockedCount / totalCount));

  void (async () => {
    try {
      if (!telemetry.getActiveJourneyId()) {
        await telemetry.startJourney();
      }
      await telemetry.progress({
        progress: Number(ratio.toFixed(3)),
        action: 'stroke_locked',
        actionDetails: `${mode}:${lockedCount}/${totalCount}`,
      });
    } catch {
      // Never interrupt gameplay
    }
  })();
}

export function trackPuzzleCompletedJourney(params: {
  readonly mode: GameMode;
  readonly edition: number;
  readonly totalScore: number;
  readonly moves: number;
  readonly isPerfect: boolean;
}): void {
  void (async () => {
    try {
      if (!telemetry.getActiveJourneyId()) {
        await telemetry.startJourney();
      }
      await telemetry.interaction({
        action: 'puzzle_completed',
        actionDetails: `${params.mode}:ed_${params.edition}:mv_${params.moves}:jade_${params.isPerfect ? 1 : 0}`,
      });
      await telemetry.endJourney({
        complete: true,
        game: {
          win: true,
          score: params.totalScore,
        },
      });
    } catch {
      // Never interrupt gameplay
    }
  })();
}

export function trackCommunityInteraction(
  action: string,
  actionDetails: string
): void {
  void telemetry
    .interaction({
      action,
      actionDetails,
    })
    .catch(() => {
      // Never interrupt gameplay
    });
}