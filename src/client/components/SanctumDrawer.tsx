import * as React from 'react';
import { memo, useEffect } from 'react';
import type {
  CompiledSigilPuzzle,
  DailyLeaderboardSnapshot,
  DailySigilPack,
  GameMode,
} from '../../shared/types';
import type { PracticeCatalogItem } from '../engine/dailyPack';
import type { CompletedSealRecord, SanctumTab } from './sanctumTypes';
import { formatDurationMs } from './timerUtils';

interface SanctumDrawerProps {
  readonly open: boolean;
  readonly activeTab: SanctumTab;
  readonly onTabChange: (tab: SanctumTab) => void;
  readonly currentUsername: string;
  readonly streak: number;
  readonly bestStreak: number;
  readonly pack: DailySigilPack;
  readonly leaderboard: DailyLeaderboardSnapshot | null;
  readonly activeMode: GameMode;
  readonly activePracticeKey: string;
  readonly practiceCatalog: readonly PracticeCatalogItem[];
  readonly dailyUnlocked: boolean;
  readonly completedRecords: ReadonlyMap<string, CompletedSealRecord>;
  readonly onRefreshLeaderboard: () => void;
  readonly onClose: () => void;
  readonly onSelectMode: (mode: GameMode) => void;
  readonly onSelectPractice: (key: string) => void;
  readonly onEnterZen: () => void;
  readonly onScatterCurrent: () => void;
}

export const SanctumDrawer = memo(function SanctumDrawer({
  open,
  activeTab,
  onTabChange,
  currentUsername,
  streak,
  bestStreak,
  pack,
  leaderboard,
  activeMode,
  activePracticeKey,
  practiceCatalog,
  dailyUnlocked,
  completedRecords,
  onRefreshLeaderboard,
  onClose,
  onSelectMode,
  onSelectPractice,
  onEnterZen,
  onScatterCurrent,
}: SanctumDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const perfectedSeals = [...completedRecords.values()].filter(
    (r) => r.isPerfect
  );

  const renderBadge = (seed: string) => {
    const rec = completedRecords.get(seed);
    if (!rec) return null;
    return (
      <span
        className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
          rec.isPerfect
            ? 'text-jade border-jade/40 bg-jade/10'
            : 'text-brass border-brass/40 bg-brass/10'
        }`}
      >
        {rec.isPerfect ? '◈ JADE' : `${rec.bestScore}`}
      </span>
    );
  };

  const renderMiniGlyph = (
    puzzle: CompiledSigilPuzzle,
    seed: string,
    locked: boolean
  ) => {
    const rec = completedRecords.get(seed);
    const stroke = locked
      ? 'rgba(167, 176, 196, 0.28)'
      : rec?.isPerfect
        ? 'var(--color-jade)'
        : rec
          ? 'var(--color-brass)'
          : 'var(--color-alabaster)';

    return (
      <div className="shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-basalt-950 border border-white/8">
        <svg viewBox="115 115 290 290" className="w-8 h-8">
          <path
            d={puzzle.unifiedSilhouettePathD}
            fill="none"
            stroke={stroke}
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const personalInTop10 =
    leaderboard?.entries.some((row) => row.username === currentUsername) ??
    false;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sigil Sanctum Navigation"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-40 flex justify-start bg-basalt-950/78 animate-reveal-rise"
    >
      <aside className="relative flex flex-col w-full max-w-[400px] h-full bg-basalt-900 border-r border-white/10 p-5 overflow-y-auto">
        {/* Drawer Header + Streak Pill */}
        <div className="flex items-center justify-between pb-4 border-b border-white/8">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono tracking-[0.22em] uppercase text-brass">
                EDITION #{String(pack.edition).padStart(3, '0')}
              </span>
              {streak > 0 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-basalt-950 border border-brass/35 text-brass">
                  {streak}d streak
                </span>
              )}
            </div>
            <h2
              className="text-base font-semibold tracking-[0.16em] uppercase text-alabaster mt-0.5"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Sanctum Codex
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Sanctum Codex"
            className="w-8 h-8 rounded-full bg-basalt-850 border border-white/10 hover:border-white/25 text-stone-300 hover:text-alabaster flex items-center justify-center cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* 4-Tab Navigation Bar */}
        <div className="grid grid-cols-4 gap-1 my-4 p-1 rounded-xl bg-basalt-950 border border-white/6">
          {(
            [
              { id: 'today', label: 'Today' },
              { id: 'ranks', label: 'Ranks' },
              { id: 'archive', label: 'Archive' },
              { id: 'vault', label: `Jade (${perfectedSeals.length})` },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onTabChange(item.id);
                if (item.id === 'ranks') onRefreshLeaderboard();
              }}
              className={`py-1.5 rounded-lg text-[10px] font-semibold tracking-[0.12em] uppercase transition-colors cursor-pointer ${
                activeTab === item.id
                  ? 'bg-basalt-850 text-alabaster border border-white/10'
                  : 'text-stone-300 hover:text-alabaster'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* TAB 1: Today's Daily + 2 Bonuses + Zen Mode */}
        {activeTab === 'today' && (
          <div className="flex flex-col gap-2.5 flex-1">
            {/* Main Daily */}
            <button
              type="button"
              onClick={() => {
                onSelectMode('daily');
                onClose();
              }}
              className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-colors cursor-pointer ${
                activeMode === 'daily'
                  ? 'bg-basalt-850 border-brass/50'
                  : 'bg-basalt-950/60 border-white/8 hover:border-white/20'
              }`}
            >
              {renderMiniGlyph(pack.main.puzzle, pack.main.seed, false)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono tracking-[0.18em] uppercase text-brass">
                    Main Daily · Streak
                  </span>
                  {renderBadge(pack.main.seed)}
                </div>
                <p className="text-sm font-semibold text-alabaster truncate mt-0.5">
                  {pack.main.puzzle.name}
                </p>
                <p className="text-[11px] text-stone-300">
                  {pack.main.tierLabel}
                </p>
              </div>
            </button>

            {/* Bonus I */}
            <button
              type="button"
              disabled={!dailyUnlocked}
              onClick={() => {
                onSelectMode('bonus-1');
                onClose();
              }}
              className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-colors ${
                !dailyUnlocked
                  ? 'bg-basalt-950/35 border-white/5 opacity-60 cursor-not-allowed'
                  : activeMode === 'bonus-1'
                    ? 'bg-basalt-850 border-brass/50 cursor-pointer'
                    : 'bg-basalt-950/60 border-white/8 hover:border-white/20 cursor-pointer'
              }`}
            >
              {renderMiniGlyph(
                pack.bonus1.puzzle,
                pack.bonus1.seed,
                !dailyUnlocked
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono tracking-[0.18em] uppercase text-stone-300">
                    Bonus I · Twin Aspect
                  </span>
                  {dailyUnlocked ? (
                    renderBadge(pack.bonus1.seed)
                  ) : (
                    <span className="text-[10px] font-mono text-stone-400">
                      Solve Daily
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-alabaster truncate mt-0.5">
                  {pack.bonus1.puzzle.name}
                </p>
                <p className="text-[11px] text-stone-300">
                  {pack.bonus1.tierLabel}
                </p>
              </div>
            </button>

            {/* Bonus II */}
            <button
              type="button"
              disabled={!dailyUnlocked}
              onClick={() => {
                onSelectMode('bonus-2');
                onClose();
              }}
              className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-colors ${
                !dailyUnlocked
                  ? 'bg-basalt-950/35 border-white/5 opacity-60 cursor-not-allowed'
                  : activeMode === 'bonus-2'
                    ? 'bg-basalt-850 border-brass/50 cursor-pointer'
                    : 'bg-basalt-950/60 border-white/8 hover:border-white/20 cursor-pointer'
              }`}
            >
              {renderMiniGlyph(
                pack.bonus2.puzzle,
                pack.bonus2.seed,
                !dailyUnlocked
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono tracking-[0.18em] uppercase text-stone-300">
                    Bonus II · Master Seal
                  </span>
                  {dailyUnlocked ? (
                    renderBadge(pack.bonus2.seed)
                  ) : (
                    <span className="text-[10px] font-mono text-stone-400">
                      Solve Daily
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-alabaster truncate mt-0.5">
                  {pack.bonus2.puzzle.name}
                </p>
                <p className="text-[11px] text-stone-300">
                  {pack.bonus2.tierLabel}
                </p>
              </div>
            </button>

            {/* Zen / Endless Mode */}
            <div className="mt-2 pt-3 border-t border-white/8">
              <button
                type="button"
                disabled={!dailyUnlocked}
                onClick={() => {
                  onEnterZen();
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border text-left transition-colors ${
                  !dailyUnlocked
                    ? 'bg-basalt-950/35 border-white/5 opacity-60 cursor-not-allowed'
                    : activeMode === 'zen'
                      ? 'bg-basalt-850 border-brass/50 cursor-pointer'
                      : 'bg-basalt-950/60 border-white/8 hover:border-white/20 cursor-pointer'
                }`}
              >
                <div>
                  <span className="text-[10px] font-mono tracking-[0.18em] uppercase text-brass">
                    Endless Sanctuary
                  </span>
                  <p className="text-sm font-semibold text-alabaster mt-0.5">
                    Zen Reconstruction
                  </p>
                  <p className="text-[11px] text-stone-300">
                    {dailyUnlocked
                      ? 'Untimed endless stream · Pure geometric calm'
                      : 'Unlocks after completing Today’s Main Daily'}
                  </p>
                </div>
                <span className="text-stone-300 text-sm" aria-hidden="true">
                  ∞
                </span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Daily Leaderboard (Top 10 + Personal Standing + Percentile) */}
        {activeTab === 'ranks' && (
          <div className="flex flex-col gap-3 flex-1">
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-basalt-950 border border-white/8">
              <div>
                <span className="text-[10px] font-mono tracking-[0.18em] uppercase text-stone-300">
                  {pack.main.puzzle.name}
                </span>
                <p className="text-xs text-alabaster mt-0.5">
                  First-attempt Daily Standings
                </p>
              </div>
              <div className="text-right font-mono">
                <span className="text-sm font-semibold text-brass">
                  {leaderboard?.totalPlayers ?? 0}
                </span>
                <span className="block text-[10px] text-stone-400 uppercase">
                  ranked
                </span>
              </div>
            </div>

            {!leaderboard || leaderboard.entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center my-auto py-10 px-4">
                <p className="text-sm font-semibold text-alabaster">
                  The Altar Awaits Its First Scribe
                </p>
                <p className="text-xs text-stone-300 mt-1">
                  Complete Today’s Main Daily to claim Rank #1 on the board.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {leaderboard.entries.map((row) => {
                  const isMe = row.username === currentUsername;
                  return (
                    <div
                      key={row.username}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border ${
                        isMe
                          ? row.isPerfect
                            ? 'bg-basalt-850 border-jade/50'
                            : 'bg-basalt-850 border-brass/50'
                          : 'bg-basalt-950/65 border-white/6'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-6 text-xs font-mono font-bold tabular-nums ${
                            row.rank === 1
                              ? 'text-brass'
                              : row.rank <= 3
                                ? 'text-alabaster'
                                : 'text-stone-400'
                          }`}
                        >
                          #{row.rank}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {row.snoovatarUrl ? (
                              <img
                                src={row.snoovatarUrl}
                                alt=""
                                className="w-5 h-5 rounded-full object-contain bg-basalt-950 border border-white/10 shrink-0"
                              />
                            ) : null}
                            <span className="text-xs font-semibold text-alabaster truncate">
                              u/{row.username}
                            </span>
                            {row.isPerfect && (
                              <span
                                title="Perfect Jade Reconstruction"
                                className="text-[10px] text-jade"
                              >
                                ◈
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-stone-400">
                            {row.moves} mv · {formatDurationMs(row.elapsedMs)}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`text-xs font-mono font-bold tabular-nums ${
                          row.isPerfect ? 'text-jade' : 'text-alabaster'
                        }`}
                      >
                        {row.score.toLocaleString('en-US')}
                      </span>
                    </div>
                  );
                })}

                {/* Pinned Personal Row when ranked outside Top 10 */}
                {!personalInTop10 && leaderboard.personalEntry && (
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-basalt-850 border border-brass/45">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xs font-mono font-bold text-brass tabular-nums">
                          #{leaderboard.personalEntry.rank}
                        </span>
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-alabaster truncate block">
                            u/{leaderboard.personalEntry.username}
                          </span>
                          <span className="text-[10px] font-mono text-stone-300">
                            Top {leaderboard.percentile ?? 100}% ·{' '}
                            {leaderboard.personalEntry.moves} mv
                          </span>
                        </div>
                      </div>

                      <span className="text-xs font-mono font-bold text-alabaster tabular-nums">
                        {leaderboard.personalEntry.score.toLocaleString('en-US')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Practice Archive (Past Days + Founders' Prelude Seals) */}
        {activeTab === 'archive' && (
          <div className="flex flex-col gap-2 flex-1">
            <p className="text-xs text-stone-300 mb-1">
              Practice past editions and Founders’ Prelude seals freely without
              affecting daily streaks.
            </p>
            {practiceCatalog.map((item) => {
              const isSelected =
                activeMode === 'practice' && activePracticeKey === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    onSelectPractice(item.key);
                    onClose();
                  }}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-basalt-850 border-brass/50'
                      : 'bg-basalt-950/60 border-white/8 hover:border-white/20'
                  }`}
                >
                  {renderMiniGlyph(
                    item.entry.puzzle,
                    item.entry.seed,
                    false
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-stone-300">
                        {item.label}
                      </span>
                      {renderBadge(item.entry.seed)}
                    </div>
                    <p className="text-sm font-medium text-alabaster truncate">
                      {item.entry.puzzle.name}
                    </p>
                    <p className="text-[11px] text-stone-400">
                      {item.entry.pieceCount} strokes
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* TAB 4: Personal Collection of Perfected Jade Sigils */}
        {activeTab === 'vault' && (
          <div className="flex flex-col flex-1">
            {perfectedSeals.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center my-auto py-10 px-4">
                <div className="w-12 h-12 rounded-2xl bg-basalt-950 border border-jade/30 flex items-center justify-center text-jade text-lg mb-3">
                  ◈
                </div>
                <p className="text-sm font-semibold text-alabaster">
                  No Jade Seals Yet
                </p>
                <p className="text-xs text-stone-300 mt-1 leading-relaxed">
                  Reconstruct any Sigil within 2 moves of par to permanently
                  inscribe its Pale Jade crest in your vault.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {perfectedSeals.map((seal) => (
                  <div
                    key={seal.seed}
                    className="flex flex-col items-center p-3 rounded-2xl bg-basalt-950 border border-jade/35 text-center"
                  >
                    <svg viewBox="115 115 290 290" className="w-16 h-16 mb-2">
                      <path
                        d={seal.silhouettePathD}
                        fill="none"
                        stroke="var(--color-jade)"
                        strokeWidth="5.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="text-xs font-semibold text-alabaster truncate w-full">
                      {seal.name}
                    </span>
                    <span className="text-[10px] font-mono text-jade mt-0.5">
                      ◈ {seal.bestScore} PTS
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Drawer Utility Footer */}
        <div className="pt-4 mt-4 border-t border-white/8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onScatterCurrent();
              onClose();
            }}
            className="text-xs tracking-[0.14em] uppercase text-stone-300 hover:text-alabaster px-3 py-1.5 rounded-lg bg-basalt-850 border border-white/10 cursor-pointer"
          >
            Re-Scatter
          </button>

          <span className="text-[11px] font-mono text-stone-400">
            Best Streak: {Math.max(streak, bestStreak)}d
          </span>
        </div>
      </aside>
    </div>
  );
});