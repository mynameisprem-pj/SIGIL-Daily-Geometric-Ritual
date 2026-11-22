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
      <div
        style={{
          fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
        }}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-full max-w-[460px] px-4 animate-reveal-rise"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-full bg-[#101522]/95 border border-white/15 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-white">{puzzle.name}</span>
            {!isZen && (
              <>
                <span className="text-slate-500">·</span>
                <span className="font-semibold text-slate-300">
                  {score.totalScore.toLocaleString('en-US')} pts
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setInspectingAltar(false)}
            className="px-4 py-1.5 rounded-full bg-white hover:bg-slate-100 text-slate-950 text-xs font-bold transition-colors cursor-pointer"
          >
            View Summary
          </button>
        </div>
      </div>
    );
  }

  const modeLabel =
    mode === 'daily'
      ? `Challenge #${edition}`
      : mode === 'bonus-1'
        ? `Bonus I · #${edition}`
        : mode === 'bonus-2'
          ? `Bonus II · #${edition}`
          : mode === 'practice'
            ? `Archive · #${edition}`
            : `Zen Mode #${edition}`;

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
      style={{
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      }}
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#06080F]/85 backdrop-blur-sm animate-reveal-rise"
    >
      <div className="relative w-full max-w-[440px] rounded-3xl bg-[#0E1320] border border-white/12 p-5 sm:p-6 shadow-[0_28px_80px_rgba(0,0,0,0.85)] text-white">
        {/* Top Row: Challenge Pill + Close/Inspect Button */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300">
              {modeLabel}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isPerfect
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              {isPerfect ? 'Jade Seal' : score.gradeLabel}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setInspectingAltar(true)}
            title="Inspect Completed Sigil"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/20 hover:border-white/50 bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
          >
            <span>Inspect</span>
          </button>
        </div>

        {/* Center Hero: Reconstructed Crest + Clean Title + Score */}
        <div className="flex items-center gap-4 pb-4 mb-4 border-b border-white/8">
          <div
            className={`shrink-0 flex items-center justify-center w-20 h-20 rounded-2xl bg-[#080B13] border ${
              isPerfect ? 'border-emerald-400/35' : 'border-amber-400/30'
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
                stroke={isPerfect ? '#6BC4A6' : '#E5B869'}
                strokeWidth="5.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="flex flex-col min-w-0">
            <h2
              id="result-sigil-title"
              className="text-xl font-bold tracking-tight text-white truncate"
            >
              {puzzle.name}
            </h2>

            {!isZen ? (
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-extrabold text-white tabular-nums">
                  {score.totalScore.toLocaleString('en-US')}
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  points
                </span>
              </div>
            ) : (
              <span className="text-xs text-slate-400 mt-1">
                Untimed meditative reconstruction
              </span>
            )}
          </div>
        </div>

        {/* Clean 4-Cell Stat Grid */}
        <div className="grid grid-cols-4 gap-2 mb-3.5">
          <div className="flex flex-col items-center justify-center py-2.5 px-1.5 rounded-2xl bg-[#141B2D] border border-white/6">
            <span className="text-[11px] font-medium text-slate-400">Moves</span>
            <span className="text-base font-bold text-white mt-0.5 tabular-nums">
              {completion.moves}
            </span>
            <span
              className={`text-[10px] font-medium ${
                isPerfect ? 'text-emerald-300' : 'text-slate-400'
              }`}
            >
              par {completion.parMoves}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center py-2.5 px-1.5 rounded-2xl bg-[#141B2D] border border-white/6">
            <span className="text-[11px] font-medium text-slate-400">Time</span>
            <span className="text-base font-bold text-white mt-0.5 tabular-nums">
              {isZen ? '—' : formatDurationMs(completion.elapsedMs)}
            </span>
            <span className="text-[10px] font-medium text-slate-400">
              {isZen ? 'untimed' : `${completion.totalCount} strokes`}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center py-2.5 px-1.5 rounded-2xl bg-[#141B2D] border border-white/6">
            <span className="text-[11px] font-medium text-slate-400">Streak</span>
            <span className="text-base font-bold text-amber-300 mt-0.5 tabular-nums">
              {streakDisplay}
            </span>
            <span className="text-[10px] font-medium text-slate-400">
              {mode === 'daily' ? 'active' : 'daily'}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenLeaderboard}
            title="View Standings"
            className="flex flex-col items-center justify-center py-2.5 px-1.5 rounded-2xl bg-[#141B2D] hover:bg-[#1B243B] border border-white/10 transition-colors cursor-pointer"
          >
            <span className="text-[11px] font-medium text-slate-400">Rank</span>
            <span className="text-base font-bold text-white mt-0.5 tabular-nums">
              {rankDisplay}
            </span>
            <span className="text-[10px] font-semibold text-sky-300">
              {percentile !== null && mode === 'daily'
                ? `Top ${Math.max(1, Math.round(percentile))}%`
                : 'View →'}
            </span>
          </button>
        </div>

        {/* Subreddit Community Benchmark Pill */}
        {showPulseLine && communityPulse && (
          <div className="flex items-center justify-center gap-2 py-2 px-3 mb-3.5 rounded-xl bg-[#141B2D]/75 border border-white/6 text-xs text-slate-300">
            <span>
              Community avg: {communityPulse.avgMoves} moves ·{' '}
              {formatDurationMs(communityPulse.avgElapsedMs ?? 0)}
            </span>
            <span className="text-slate-500">·</span>
            <span className="font-semibold text-emerald-300">
              {communityPulse.jadeRatePercent}% Jade
            </span>
          </div>
        )}

        {/* Primary Crisp White CTA Pill (HotAndCold Style!) */}
        <button
          type="button"
          onClick={nextAction.onTrigger}
          className="w-full flex items-center justify-between px-5 py-3 rounded-full bg-white hover:bg-slate-100 text-slate-950 transition-colors cursor-pointer mb-2.5 shadow-lg"
        >
          <div className="flex flex-col text-left">
            <span className="text-xs font-extrabold uppercase tracking-wide">
              {nextAction.label}
            </span>
            <span className="text-[11px] font-medium text-slate-600">
              {nextAction.sublabel}
            </span>
          </div>
          <span className="text-base font-bold leading-none" aria-hidden="true">
            →
          </span>
        </button>

        {/* Secondary Sharing Row: Post Score to Thread + Copy */}
        <div className="grid grid-cols-2 gap-2 mb-2.5">
          {isAuthenticated && (
            <button
              type="button"
              disabled={postingComment || commentSharedToday}
              onClick={() => void handlePostComment()}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-full border text-xs font-semibold transition-colors ${
                commentSharedToday
                  ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 cursor-default'
                  : 'bg-[#141B2D] hover:bg-[#1C253D] border-white/15 text-white cursor-pointer'
              }`}
            >
              {commentSharedToday
                ? 'Posted to Thread ✓'
                : postingComment
                  ? 'Posting…'
                  : 'Post Score'}
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleCopyShare()}
            className={`flex items-center justify-center py-2.5 px-3 rounded-full bg-[#141B2D] hover:bg-[#1C253D] border border-white/15 text-xs font-semibold text-white transition-colors cursor-pointer ${
              !isAuthenticated ? 'col-span-2' : ''
            }`}
          >
            {copiedJustNow ? 'Copied ✓' : 'Copy Result'}
          </button>
        </div>

        {/* Clean Footer Links: Standings · Play Again · Vault */}
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={onOpenLeaderboard}
            className="flex items-center justify-center py-2 px-2 rounded-full bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Standings
          </button>

          <button
            type="button"
            onClick={onReplay}
            className="flex items-center justify-center py-2 px-2 rounded-full bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Play Again
          </button>

          <button
            type="button"
            onClick={onOpenSanctum}
            className="flex items-center justify-center py-2 px-2 rounded-full bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Jade Vault
          </button>
        </div>
      </div>
    </div>
  );
});