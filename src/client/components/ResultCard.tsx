import { memo, useCallback, useState } from 'react';
import { buildShareDispatchText } from '../../shared/shareFormatter';
import type {
  CommunityPulseStats,
  CompiledSigilPuzzle,
  GameMode,
  PuzzleCompletionStats,
  ScoreBreakdown,
} from '../../shared/types';
import { trackCommunityInteraction } from '../telemetry/journeys';
import { postResultCommentToThread } from '../utils/apiClient';
import { copyShareDispatch } from '../utils/clipboardShare';
import type { NextActionConfig } from './resultTypes';
import { formatDurationMs } from './timerUtils';

interface ResultCardProps {
  readonly mode: GameMode;
  readonly edition: number;
  readonly puzzle: CompiledSigilPuzzle;
  readonly completion: PuzzleCompletionStats;
  readonly score: ScoreBreakdown;
  readonly streak: number;
  readonly personalRank: number | null;
  readonly percentile: number | null;
  readonly communityPulse: CommunityPulseStats | null;
  readonly isAuthenticated: boolean;
  readonly commentSharedToday: boolean;
  readonly onMarkedCommentShared: () => void;
  readonly nextAction: NextActionConfig;
  readonly onReplay: () => void;
  readonly onOpenLeaderboard: () => void;
  readonly onOpenSanctum: () => void;
}

export const ResultCard = memo(function ResultCard({
  mode,
  edition,
  puzzle,
  completion,
  score,
  streak,
  personalRank,
  percentile,
  communityPulse,
  isAuthenticated,
  commentSharedToday,
  onMarkedCommentShared,
  nextAction,
  onReplay,
  onOpenLeaderboard,
  onOpenSanctum,
}: ResultCardProps) {
  const [copiedJustNow, setCopiedJustNow] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [inspectingAltar, setInspectingAltar] = useState(false);

  const isPerfect = score.isPerfect;
  const isZen = mode === 'zen';

  const handleCopyShare = useCallback(async () => {
    trackCommunityInteraction('share_clipboard', `${mode}:ed_${edition}`);
    const text = buildShareDispatchText({
      mode,
      edition,
      sigilName: puzzle.name,
      pieceCount: completion.totalCount,
      moves: completion.moves,
      elapsedMs: completion.elapsedMs,
      score,
      streak,
      percentile,
    });

    const ok = await copyShareDispatch(text);
    if (ok) {
      setCopiedJustNow(true);
      window.setTimeout(() => setCopiedJustNow(false), 2200);
    }
  }, [
    completion.elapsedMs,
    completion.moves,
    completion.totalCount,
    edition,
    mode,
    percentile,
    puzzle.name,
    score,
    streak,
  ]);

  const handlePostComment = useCallback(async () => {
    if (postingComment || commentSharedToday) return;
    setPostingComment(true);
    trackCommunityInteraction('share_reddit_comment', `${mode}:ed_${edition}`);

    const result = await postResultCommentToThread({
      mode,
      edition,
      sigilName: puzzle.name,
      pieceCount: completion.totalCount,
      moves: completion.moves,
      parMoves: completion.parMoves,
      elapsedMs: completion.elapsedMs,
    });

    setPostingComment(false);
    if (result.ok) {
      onMarkedCommentShared();
    }
  }, [
    commentSharedToday,
    completion.elapsedMs,
    completion.moves,
    completion.parMoves,
    completion.totalCount,
    edition,
    mode,
    onMarkedCommentShared,
    postingComment,
    puzzle.name,
  ]);

  if (inspectingAltar) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-full max-w-[460px] px-4 animate-reveal-rise">
        <div
          className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-full bg-basalt-900/95 border shadow-2xl ${
            isPerfect ? 'border-jade/50' : 'border-brass/50'
          }`}
        >
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`font-semibold tracking-[0.14em] uppercase ${
                isPerfect ? 'text-jade' : 'text-brass'
              }`}
            >
              {puzzle.name}
            </span>
            {!isZen && (
              <>
                <span className="text-stone-400">·</span>
                <span className="font-mono text-alabaster">
                  {score.totalScore} PTS
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setInspectingAltar(false)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-[0.14em] uppercase text-basalt-950 transition-colors cursor-pointer ${
              isPerfect
                ? 'bg-jade hover:bg-jade-bright'
                : 'bg-brass hover:bg-brass-bright'
            }`}
          >
            Result Card
          </button>
        </div>
      </div>
    );
  }

  const modeEyebrow =
    mode === 'daily'
      ? `DAILY SIGIL #${String(edition).padStart(3, '0')}`
      : mode === 'bonus-1'
        ? `BONUS I · #${String(edition).padStart(3, '0')}`
        : mode === 'bonus-2'
          ? `BONUS II · #${String(edition).padStart(3, '0')}`
          : mode === 'practice'
            ? `ARCHIVE · #${String(edition).padStart(3, '0')}`
            : `ZEN RITUAL #${edition}`;

  const rankDisplay =
    mode !== 'daily'
      ? mode === 'zen'
        ? 'Calm'
        : 'Bonus'
      : personalRank !== null
        ? `#${personalRank}`
        : '—';

  const streakDisplay =
    mode === 'daily'
      ? `${Math.max(1, streak)}d`
      : streak > 0
        ? `${streak}d`
        : '—';

  const showPulseLine =
    mode === 'daily' &&
    communityPulse !== null &&
    communityPulse.totalSolves > 0 &&
    communityPulse.avgMoves !== null &&
    communityPulse.avgElapsedMs !== null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-sigil-title"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-basalt-950/80 animate-reveal-rise"
    >
      <div
        className={`relative w-full max-w-[440px] rounded-[26px] bg-basalt-900 border p-5 sm:p-6 shadow-[0_28px_80px_rgba(0,0,0,0.88)] ${
          isPerfect ? 'border-jade/50' : 'border-brass/45'
        }`}
      >
        {/* Top Row: Eyebrow + Inspect Altar Toggle */}
        <div className="flex items-center justify-between gap-2 mb-3.5">
          <span className="text-[11px] font-mono tracking-[0.2em] uppercase text-stone-300">
            {modeEyebrow}
          </span>

          <button
            type="button"
            onClick={() => setInspectingAltar(true)}
            className="text-[11px] tracking-[0.14em] uppercase text-stone-300 hover:text-alabaster px-2.5 py-1 rounded-full bg-basalt-850 border border-white/10 hover:border-white/25 transition-colors cursor-pointer"
          >
            Inspect Altar
          </button>
        </div>

        {/* Center Hero: Miniature Reconstructed Crest + Title + Mastery Seal */}
        <div className="flex items-center gap-4 pb-3.5 mb-3.5 border-b border-white/8">
          <div
            className={`shrink-0 flex items-center justify-center w-20 h-20 rounded-2xl bg-basalt-950 border ${
              isPerfect ? 'border-jade/40' : 'border-brass/35'
            }`}
          >
            <svg viewBox="115 115 290 290" className="w-16 h-16">
              <circle
                cx="260"
                cy="260"
                r="128"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1.5"
              />
              <path
                d={puzzle.unifiedSilhouettePathD}
                fill="none"
                stroke={isPerfect ? 'var(--color-jade)' : 'var(--color-brass)'}
                strokeWidth="5.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="flex flex-col min-w-0">
            <span
              className={`text-[11px] font-semibold tracking-[0.18em] uppercase ${
                isPerfect ? 'text-jade' : 'text-brass'
              }`}
            >
              {isPerfect
                ? '◈ Jade Seal · Perfect Reconstruction'
                : `◈ ${score.gradeLabel}`}
            </span>

            <h2
              id="result-sigil-title"
              className="text-lg sm:text-xl font-semibold tracking-[0.12em] uppercase text-alabaster truncate mt-0.5"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {puzzle.name}
            </h2>

            {!isZen ? (
              <div className="flex items-baseline gap-2 mt-1">
                <span
                  className={`text-2xl font-bold font-mono tabular-nums ${
                    isPerfect ? 'text-jade' : 'text-alabaster'
                  }`}
                >
                  {score.totalScore.toLocaleString('en-US')}
                </span>
                <span className="text-[11px] font-mono uppercase tracking-widest text-stone-300">
                  PTS
                </span>
              </div>
            ) : (
              <span className="text-xs text-stone-300 mt-1">
                Untimed Meditative Reconstruction
              </span>
            )}
          </div>
        </div>

        {/* 4-Cell Stat Grid */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="flex flex-col items-center justify-center py-2.5 px-1.5 rounded-xl bg-basalt-950/90 border border-white/6">
            <span className="text-[10px] tracking-[0.16em] uppercase text-stone-300">
              Moves
            </span>
            <span className="text-sm font-mono font-semibold text-alabaster mt-0.5 tabular-nums">
              {completion.moves}
            </span>
            <span
              className={`text-[10px] font-mono ${
                isPerfect ? 'text-jade' : 'text-stone-400'
              }`}
            >
              par {completion.parMoves}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center py-2.5 px-1.5 rounded-xl bg-basalt-950/90 border border-white/6">
            <span className="text-[10px] tracking-[0.16em] uppercase text-stone-300">
              Time
            </span>
            <span className="text-sm font-mono font-semibold text-alabaster mt-0.5 tabular-nums">
              {isZen ? '—' : formatDurationMs(completion.elapsedMs)}
            </span>
            <span className="text-[10px] font-mono text-stone-400">
              {isZen ? 'untimed' : `${completion.totalCount} strokes`}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center py-2.5 px-1.5 rounded-xl bg-basalt-950/90 border border-white/6">
            <span className="text-[10px] tracking-[0.16em] uppercase text-stone-300">
              Streak
            </span>
            <span className="text-sm font-mono font-semibold text-brass mt-0.5 tabular-nums">
              {streakDisplay}
            </span>
            <span className="text-[10px] font-mono text-stone-400">
              {mode === 'daily' ? 'active' : 'daily only'}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenLeaderboard}
            title="View Today’s Top 10 Leaderboard"
            className="flex flex-col items-center justify-center py-2.5 px-1.5 rounded-xl bg-basalt-950/90 border border-white/10 hover:border-brass/45 transition-colors cursor-pointer"
          >
            <span className="text-[10px] tracking-[0.16em] uppercase text-stone-300">
              Rank
            </span>
            <span className="text-sm font-mono font-semibold text-alabaster mt-0.5 tabular-nums">
              {rankDisplay}
            </span>
            <span className="text-[10px] font-mono text-brass">
              {percentile !== null && mode === 'daily'
                ? `Top ${Math.max(1, Math.round(percentile))}%`
                : 'board →'}
            </span>
          </button>
        </div>

        {/* Live Subreddit Community Pulse Benchmark */}
        {showPulseLine && communityPulse && (
          <div className="flex items-center justify-center gap-2 py-1.5 px-3 mb-3.5 rounded-xl bg-basalt-950/70 border border-white/6 text-[11px] font-mono text-stone-300">
            <span>
              Subreddit avg: {communityPulse.avgMoves} mv ·{' '}
              {formatDurationMs(communityPulse.avgElapsedMs ?? 0)}
            </span>
            <span className="text-stone-400">·</span>
            <span className="text-jade">
              ◈ {communityPulse.jadeRatePercent}% Jade
            </span>
          </div>
        )}

        {/* Reddit-Native Sharing Row: One-Tap Post to Thread + Copy Dispatch */}
        <div className="grid grid-cols-2 gap-2 mb-2.5">
          {isAuthenticated && (
            <button
              type="button"
              disabled={postingComment || commentSharedToday}
              onClick={() => void handlePostComment()}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border text-xs font-semibold tracking-[0.12em] uppercase transition-colors ${
                commentSharedToday
                  ? 'bg-basalt-950 border-jade/40 text-jade cursor-default'
                  : 'bg-basalt-850 border-brass/45 hover:border-brass text-alabaster cursor-pointer'
              }`}
            >
              {commentSharedToday
                ? 'Inscribed ✓'
                : postingComment
                  ? 'Inscribing…'
                  : 'Post to Thread'}
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleCopyShare()}
            className={`flex items-center justify-center py-2.5 px-3 rounded-xl bg-basalt-850 border border-white/12 hover:border-brass/50 text-xs font-semibold tracking-[0.12em] uppercase text-alabaster transition-colors cursor-pointer ${
              !isAuthenticated ? 'col-span-2' : ''
            }`}
          >
            {copiedJustNow ? 'Copied ✓' : 'Copy Dispatch'}
          </button>
        </div>

        {/* Primary Next Action CTA */}
        <button
          type="button"
          onClick={nextAction.onTrigger}
          className={`w-full flex items-center justify-between px-5 py-3 rounded-2xl text-basalt-950 transition-colors cursor-pointer mb-2.5 ${
            isPerfect
              ? 'bg-jade hover:bg-jade-bright'
              : 'bg-brass hover:bg-brass-bright'
          }`}
        >
          <div className="flex flex-col text-left">
            <span className="text-xs font-extrabold tracking-[0.16em] uppercase">
              {nextAction.label}
            </span>
            <span className="text-[11px] font-medium opacity-80">
              {nextAction.sublabel}
            </span>
          </div>
          <span className="text-base font-bold leading-none" aria-hidden="true">
            →
          </span>
        </button>

        {/* Quiet Utility Links: Ranks + Replay + Codex */}
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={onOpenLeaderboard}
            className="flex items-center justify-center py-2 px-2 rounded-xl bg-basalt-850/80 border border-white/8 hover:border-white/25 text-[11px] font-medium tracking-[0.1em] uppercase text-stone-300 hover:text-alabaster transition-colors cursor-pointer"
          >
            Ranks
          </button>

          <button
            type="button"
            onClick={onReplay}
            className="flex items-center justify-center py-2 px-2 rounded-xl bg-basalt-850/80 border border-white/8 hover:border-white/25 text-[11px] font-medium tracking-[0.1em] uppercase text-stone-300 hover:text-alabaster transition-colors cursor-pointer"
          >
            Replay
          </button>

          <button
            type="button"
            onClick={onOpenSanctum}
            className="flex items-center justify-center py-2 px-2 rounded-xl bg-basalt-850/80 border border-white/8 hover:border-white/25 text-[11px] font-medium tracking-[0.1em] uppercase text-stone-300 hover:text-alabaster transition-colors cursor-pointer"
          >
            Codex
          </button>
        </div>
      </div>
    </div>
  );
});