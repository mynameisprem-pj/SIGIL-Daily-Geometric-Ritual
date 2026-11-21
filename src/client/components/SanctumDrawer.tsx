import * as React from 'react';
import { memo, useEffect, useState } from 'react';
import type {
  CompiledSigilPuzzle,
  DailySigilPack,
  GameMode,
} from '../../shared/types';
import type { PracticeCatalogItem } from '../engine/dailyPack';

export interface CompletedSealRecord {
  readonly seed: string;
  readonly name: string;
  readonly silhouettePathD: string;
  readonly isPerfect: boolean;
  readonly bestScore: number;
}

interface SanctumDrawerProps {
  readonly open: boolean;
  readonly pack: DailySigilPack;
  readonly activeMode: GameMode;
  readonly activePracticeKey: string;
  readonly practiceCatalog: readonly PracticeCatalogItem[];
  readonly dailyUnlocked: boolean;
  readonly completedRecords: ReadonlyMap<string, CompletedSealRecord>;
  readonly onClose: () => void;
  readonly onSelectMode: (mode: GameMode) => void;
  readonly onSelectPractice: (key: string) => void;
  readonly onEnterZen: () => void;
  readonly onScatterCurrent: () => void;
}

type DrawerTab = 'today' | 'archive' | 'vault';

export const SanctumDrawer = memo(function SanctumDrawer({
  open,
  pack,
  activeMode,
  activePracticeKey,
  practiceCatalog,
  dailyUnlocked,
  completedRecords,
  onClose,
  onSelectMode,
  onSelectPractice,
  onEnterZen,
  onScatterCurrent,
}: SanctumDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>('today');

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sigil Sanctum Navigation"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-40 flex justify-start bg-basalt-950/78 animate-reveal-rise"
    >
      <aside className="relative flex flex-col w-full max-w-[380px] h-full bg-basalt-900 border-r border-white/10 p-5 overflow-y-auto">
        {/* Drawer Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/8">
          <div>
            <span className="text-[10px] font-mono tracking-[0.22em] uppercase text-brass">
              EDITION #{String(pack.edition).padStart(3, '0')}
            </span>
            <h2
              className="text-base font-semibold tracking-[0.16em] uppercase text-alabaster"
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

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1.5 my-4 p-1 rounded-xl bg-basalt-950 border border-white/6">
          {(
            [
              { id: 'today', label: 'Today' },
              { id: 'archive', label: 'Archive' },
              { id: 'vault', label: `Jade (${perfectedSeals.length})` },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`py-1.5 rounded-lg text-[11px] font-semibold tracking-[0.14em] uppercase transition-colors cursor-pointer ${
                tab === item.id
                  ? 'bg-basalt-850 text-alabaster border border-white/10'
                  : 'text-stone-300 hover:text-alabaster'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* TAB 1: Today's Daily + 2 Bonuses + Zen Mode */}
        {tab === 'today' && (
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

        {/* TAB 2: Practice Archive (Past Days + Founders' Prelude Seals) */}
        {tab === 'archive' && (
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

        {/* TAB 3: Personal Collection of Perfected Jade Sigils */}
        {tab === 'vault' && (
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
            Re-Scatter Current
          </button>

          <span className="text-[11px] font-mono text-stone-400">
            SIGIL · 2026
          </span>
        </div>
      </aside>
    </div>
  );
});