import './index.css';

import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { calculateSigilScore } from '../shared/scoring';
import type { GameMode } from '../shared/types';
import { LiveTimer } from './components/LiveTimer';
import { SigilStage } from './components/SigilStage';
import { SoundToggleButton } from './components/SoundToggleButton';
import { formatDurationMs } from './components/timerUtils';
import { useDailyPack } from './hooks/useDailyPack';
import { usePuzzleEngine } from './hooks/usePuzzleEngine';
import { useSession } from './hooks/useSession';

const DAILY_MODES: readonly { mode: GameMode; shortLabel: string }[] = [
  { mode: 'daily', shortLabel: 'Daily' },
  { mode: 'bonus-1', shortLabel: 'Bonus I' },
  { mode: 'bonus-2', shortLabel: 'Bonus II' },
];

export const App = () => {
  const { session } = useSession();
  const daily = useDailyPack(session?.dateKey, session?.username);
  const [reshuffleCount, setReshuffleCount] = useState(0);

  const { activeEntry, activeMode, selectMode } = daily;
  const seedKey = `${activeEntry.seed}:r${reshuffleCount}`;

  const engine = usePuzzleEngine(activeEntry.puzzle, seedKey);
  const { completion } = engine;

  const scoreBreakdown = useMemo(() => {
    if (!completion.isComplete) return null;
    return calculateSigilScore({
      moves: completion.moves,
      parMoves: completion.parMoves,
      elapsedMs: completion.elapsedMs,
      pieceCount: completion.totalCount,
    });
  }, [completion]);

  const handleReset = () => {
    setReshuffleCount((c) => c + 1);
  };

  const handleNextDailyTier = () => {
    if (activeMode === 'daily') selectMode('bonus-1');
    else if (activeMode === 'bonus-1') selectMode('bonus-2');
    else selectMode('daily');
  };

  return (
    <main className="relative flex flex-col items-center justify-between w-full h-screen bg-basalt-950 text-alabaster px-4 py-3 sm:py-5 overflow-hidden select-none">
      {/* Uncluttered Top Sanctuary HUD */}
      <header className="w-full max-w-[496px] flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono tracking-[0.18em] uppercase text-brass">
              #{String(activeEntry.edition).padStart(3, '0')}
            </span>
            <span className="text-stone-400">·</span>
            <h1
              className="text-sm sm:text-base font-semibold tracking-[0.14em] uppercase text-alabaster"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {activeEntry.puzzle.name}
            </h1>
          </div>
          <span className="text-[11px] text-stone-300 tracking-wide">
            {completion.isComplete
              ? activeEntry.puzzle.subtitle
              : `${activeEntry.tierLabel} · ${completion.lockedCount}/${completion.totalCount} inlaid`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-basalt-900 border border-white/8 text-xs text-stone-300">
            <span className="font-mono tabular-nums">
              <span className="text-stone-400 mr-1">MV</span>
              <span className="text-alabaster">{engine.moves}</span>
            </span>
            <span className="text-white/15">|</span>
            <span className="text-alabaster">
              <LiveTimer
                startedAtMs={engine.startedAtMs}
                completedAtMs={engine.completedAtMs}
              />
            </span>
          </div>

          <SoundToggleButton />
        </div>
      </header>

      {/* Focused Basalt Astrolabe Stage */}
      <SigilStage
        puzzle={engine.puzzle}
        pieceMap={engine.pieceMap}
        states={engine.states}
        selectedPieceId={engine.selectedPieceId}
        hasInteracted={engine.hasInteracted}
        isComplete={completion.isComplete}
        isPerfect={completion.isPerfect}
        ignitionPhase={engine.ignitionPhase}
        lastSnapEvent={engine.lastSnapEvent}
        onSelectPiece={engine.selectAndBringToFront}
        onCommitDrop={engine.commitPieceDrop}
        onRotatePiece={engine.rotatePiece}
        previewCanSnap={engine.previewCanSnap}
      />

      {/* Minimal Bottom Ritual Bar (Upgraded to Full Authoritative Result Card in Phase 4) */}
      <footer className="w-full max-w-[496px] min-h-[48px] flex items-center justify-between text-xs">
        {completion.isComplete && scoreBreakdown ? (
          <div
            className={`animate-reveal-rise w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-basalt-900 border ${
              completion.isPerfect ? 'border-jade/45' : 'border-brass/45'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2.5">
              <span
                className={`font-semibold tracking-[0.14em] uppercase ${
                  completion.isPerfect ? 'text-jade' : 'text-brass'
                }`}
              >
                {scoreBreakdown.gradeLabel} · {scoreBreakdown.totalScore} PTS
              </span>
              <span className="hidden sm:inline text-stone-400">·</span>
              <span className="text-stone-300 font-mono text-[11px]">
                {engine.moves} mv · {formatDurationMs(completion.elapsedMs)}
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextDailyTier}
              className={`px-4 py-1.5 rounded-full text-basalt-950 font-bold tracking-[0.14em] uppercase cursor-pointer transition-colors ${
                completion.isPerfect
                  ? 'bg-jade hover:bg-jade-bright'
                  : 'bg-brass hover:bg-brass-bright'
              }`}
            >
              {activeMode === 'daily'
                ? 'Bonus I'
                : activeMode === 'bonus-1'
                  ? 'Bonus II'
                  : 'Main Daily'}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              {DAILY_MODES.map((item) => {
                const isActive = activeMode === item.mode;
                return (
                  <button
                    key={item.mode}
                    type="button"
                    onClick={() => selectMode(item.mode)}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] tracking-wider uppercase transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-basalt-850 border-brass/50 text-brass font-semibold'
                        : 'bg-basalt-900 border-white/8 text-stone-300 hover:text-alabaster'
                    }`}
                  >
                    {item.shortLabel}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 rounded-lg bg-basalt-900 border border-white/10 hover:border-brass/40 text-stone-300 hover:text-alabaster transition-colors cursor-pointer"
            >
              Scatter
            </button>
          </>
        )}
      </footer>
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);