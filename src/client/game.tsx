import './index.css';

import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LiveTimer } from './components/LiveTimer';
import { formatDurationMs } from './components/timerUtils';
import { SigilStage } from './components/SigilStage';
import { SoundToggleButton } from './components/SoundToggleButton';
import { PROTOTYPE_SIGILS } from './engine/prototypeSigils';
import { usePuzzleEngine } from './hooks/usePuzzleEngine';
import { useSession } from './hooks/useSession';

export const App = () => {
  const { session } = useSession();
  const [sigilIndex, setSigilIndex] = useState(0);
  const [reshuffleCount, setReshuffleCount] = useState(0);

  const activePuzzle = PROTOTYPE_SIGILS[sigilIndex] ?? PROTOTYPE_SIGILS[0]!;
  const seedKey = `${session?.dateKey ?? '2026-11-21'}:s${reshuffleCount}`;

  const engine = usePuzzleEngine(activePuzzle, seedKey);
  const { completion } = engine;

  const handleNextPrototype = () => {
    setSigilIndex((idx) => (idx + 1) % PROTOTYPE_SIGILS.length);
  };

  const handleReset = () => {
    setReshuffleCount((c) => c + 1);
  };

  return (
    <main className="relative flex flex-col items-center justify-between w-full h-screen bg-basalt-950 text-alabaster px-4 py-3 sm:py-5 overflow-hidden select-none">
      {/* Uncluttered Top Sanctuary HUD */}
      <header className="w-full max-w-[496px] flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono tracking-[0.18em] uppercase text-brass">
              #{String(session?.edition ?? 1).padStart(3, '0')}
            </span>
            <span className="text-stone-400">·</span>
            <h1
              className="text-sm sm:text-base font-semibold tracking-[0.14em] uppercase text-alabaster"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {activePuzzle.name}
            </h1>
          </div>
          <span className="text-[11px] text-stone-300 tracking-wide">
            {completion.isComplete
              ? activePuzzle.subtitle
              : `${completion.lockedCount} of ${completion.totalCount} inlaid`}
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

      {/* Minimal Bottom Ritual Bar */}
      <footer className="w-full max-w-[496px] min-h-[48px] flex items-center justify-between text-xs">
        {completion.isComplete ? (
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
                {completion.isPerfect
                  ? 'Perfect Reconstruction'
                  : 'Sigil Ignited'}
              </span>
              <span className="hidden sm:inline text-stone-400">·</span>
              <span className="text-stone-300 font-mono text-[11px]">
                {engine.moves} moves · {formatDurationMs(completion.elapsedMs)}
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextPrototype}
              className={`px-4 py-1.5 rounded-full text-basalt-950 font-bold tracking-[0.14em] uppercase cursor-pointer transition-colors ${
                completion.isPerfect
                  ? 'bg-jade hover:bg-jade-bright'
                  : 'bg-brass hover:bg-brass-bright'
              }`}
            >
              Next Sigil
            </button>
          </div>
        ) : (
          <>
            <span className="text-stone-300 tracking-wide">
              Drag to inlay · Tap piece to rotate 45°
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 rounded-lg bg-basalt-900 border border-white/10 hover:border-brass/40 text-stone-300 hover:text-alabaster transition-colors cursor-pointer"
              >
                Scatter
              </button>
              <button
                type="button"
                onClick={handleNextPrototype}
                className="px-3 py-1.5 rounded-lg bg-basalt-900 border border-white/10 hover:border-brass/40 text-stone-300 hover:text-alabaster font-mono transition-colors cursor-pointer"
              >
                {sigilIndex + 1}/{PROTOTYPE_SIGILS.length}
              </button>
            </div>
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