import './index.css';

import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LiveTimer } from './components/LiveTimer';
import { formatDurationMs } from './components/timerUtils';
import { SigilStage } from './components/SigilStage';
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
    <main className="relative flex flex-col items-center justify-between w-full h-screen bg-obsidian-950 text-ivory px-4 py-3 sm:py-5 overflow-hidden select-none">
      {/* Uncluttered Top Telemetry Bar */}
      <header className="w-full max-w-[500px] flex items-center justify-between text-xs tracking-[0.18em] uppercase text-stone-muted">
        <div className="flex items-center gap-2.5">
          <span className="text-ivory font-medium">{activePuzzle.name}</span>
          <span className="text-white/20">•</span>
          <span>
            {completion.lockedCount}/{completion.totalCount}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span>Moves {engine.moves}</span>
          <LiveTimer
            startedAtMs={engine.startedAtMs}
            completedAtMs={engine.completedAtMs}
          />
        </div>
      </header>

      {/* Focused Center SVG Stage */}
      <SigilStage
        puzzle={engine.puzzle}
        pieceMap={engine.pieceMap}
        states={engine.states}
        selectedPieceId={engine.selectedPieceId}
        hasInteracted={engine.hasInteracted}
        isComplete={completion.isComplete}
        lastSnapEvent={engine.lastSnapEvent}
        onSelectPiece={engine.selectAndBringToFront}
        onCommitDrop={engine.commitPieceDrop}
        onRotatePiece={engine.rotatePiece}
        previewCanSnap={engine.previewCanSnap}
      />

      {/* Minimal Bottom Context / Completion Bar */}
      <footer className="w-full max-w-[500px] min-h-[44px] flex items-center justify-between text-xs text-stone-muted">
        {completion.isComplete ? (
          <div className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-full bg-obsidian-900 border border-rune-gold/35">
            <div className="flex items-center gap-2.5">
              <span className="text-rune-gold font-semibold tracking-wider uppercase">
                {completion.isPerfect
                  ? 'Perfect Reconstruction'
                  : 'Sigil Reconstructed'}
              </span>
              <span className="text-white/25">•</span>
              <span className="text-ivory/85">
                {engine.moves} moves in {formatDurationMs(completion.elapsedMs)}
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextPrototype}
              className="px-3.5 py-1 rounded-full bg-rune-gold text-obsidian-950 font-semibold tracking-wider uppercase cursor-pointer hover:bg-rune-glow transition-colors"
            >
              Next Sigil
            </button>
          </div>
        ) : (
          <>
            <span className="tracking-wide text-stone-muted/80">
              Drag to place · Tap piece to rotate 45°
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-2.5 py-1 rounded-md border border-white/10 hover:border-white/25 text-stone-muted hover:text-ivory transition-colors cursor-pointer"
              >
                Scatter
              </button>
              <button
                type="button"
                onClick={handleNextPrototype}
                className="px-2.5 py-1 rounded-md border border-white/10 hover:border-white/25 text-stone-muted hover:text-ivory transition-colors cursor-pointer"
              >
                Sigil {sigilIndex + 1}/{PROTOTYPE_SIGILS.length}
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