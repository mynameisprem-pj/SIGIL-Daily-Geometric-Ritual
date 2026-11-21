import './index.css';

import { StrictMode, useCallback, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { calculateSigilScore } from '../shared/scoring';
import type { PuzzleCompletionStats } from '../shared/types';
import { LiveTimer } from './components/LiveTimer';
import { type NextActionConfig, ResultCard } from './components/ResultCard';
import {
  type CompletedSealRecord,
  SanctumDrawer,
} from './components/SanctumDrawer';
import { SigilStage } from './components/SigilStage';
import { SoundToggleButton } from './components/SoundToggleButton';
import { useDailyPack } from './hooks/useDailyPack';
import { usePuzzleEngine } from './hooks/usePuzzleEngine';
import { useSession } from './hooks/useSession';

export const App = () => {
  const { session } = useSession();
  const daily = useDailyPack(session?.dateKey, session?.username);
  const [reshuffleCount, setReshuffleCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [completedRecords, setCompletedRecords] = useState<
    Map<string, CompletedSealRecord>
  >(() => new Map());

  const {
    pack,
    practiceCatalog,
    activeMode,
    activeEntry,
    activePracticeKey,
    selectMode,
    selectPracticeItem,
    advanceZen,
  } = daily;

  // Event-driven completion handler (zero cascading useEffect renders!)
  const handlePuzzleComplete = useCallback(
    (stats: PuzzleCompletionStats) => {
      const breakdown = calculateSigilScore({
        moves: stats.moves,
        parMoves: stats.parMoves,
        elapsedMs: stats.elapsedMs,
        pieceCount: stats.totalCount,
      });

      setCompletedRecords((prev) => {
        const existing = prev.get(activeEntry.seed);
        if (
          existing &&
          existing.bestScore >= breakdown.totalScore &&
          (existing.isPerfect || !breakdown.isPerfect)
        ) {
          return prev;
        }

        const next = new Map(prev);
        next.set(activeEntry.seed, {
          seed: activeEntry.seed,
          name: activeEntry.puzzle.name,
          silhouettePathD: activeEntry.puzzle.unifiedSilhouettePathD,
          isPerfect: Boolean(existing?.isPerfect) || breakdown.isPerfect,
          bestScore: Math.max(existing?.bestScore ?? 0, breakdown.totalScore),
        });
        return next;
      });
    },
    [
      activeEntry.puzzle.name,
      activeEntry.puzzle.unifiedSilhouettePathD,
      activeEntry.seed,
    ]
  );

  const seedKey = `${activeEntry.seed}:r${reshuffleCount}`;
  const engine = usePuzzleEngine(
    activeEntry.puzzle,
    seedKey,
    handlePuzzleComplete
  );
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

  const dailyUnlocked =
    Boolean(session?.dailyCompleted) || completedRecords.has(pack.main.seed);

  const effectiveStreak = useMemo(() => {
    const baseStreak = session?.streak ?? 0;
    if (!session?.dailyCompleted && completedRecords.has(pack.main.seed)) {
      return baseStreak + 1;
    }
    return baseStreak;
  }, [
    completedRecords,
    pack.main.seed,
    session?.dailyCompleted,
    session?.streak,
  ]);

  const handleScatterCurrent = useCallback(() => {
    setReshuffleCount((c) => c + 1);
  }, []);

  const nextAction = useMemo<NextActionConfig>(() => {
    if (activeMode === 'daily') {
      return {
        label: 'Continue to Bonus I',
        sublabel: `${pack.bonus1.puzzle.name} · ${pack.bonus1.pieceCount} Strokes`,
        onTrigger: () => selectMode('bonus-1'),
      };
    }
    if (activeMode === 'bonus-1') {
      return {
        label: 'Continue to Bonus II',
        sublabel: `${pack.bonus2.puzzle.name} · ${pack.bonus2.pieceCount} Strokes`,
        onTrigger: () => selectMode('bonus-2'),
      };
    }
    if (activeMode === 'bonus-2') {
      return {
        label: 'Enter Zen Sanctuary',
        sublabel: 'Endless untimed reconstruction',
        onTrigger: () => advanceZen(),
      };
    }
    if (activeMode === 'zen') {
      return {
        label: 'Next Zen Sigil',
        sublabel: 'Continue meditative flow',
        onTrigger: () => advanceZen(),
      };
    }
    return {
      label: dailyUnlocked ? 'Enter Zen Sanctuary' : 'Play Today’s Main Daily',
      sublabel: dailyUnlocked
        ? 'Endless untimed reconstruction'
        : `${pack.main.puzzle.name} · Counts for Streak`,
      onTrigger: () => (dailyUnlocked ? advanceZen() : selectMode('daily')),
    };
  }, [activeMode, advanceZen, dailyUnlocked, pack, selectMode]);

  const modeBadgeLabel =
    activeMode === 'daily'
      ? `#${String(activeEntry.edition).padStart(3, '0')}`
      : activeMode === 'bonus-1'
        ? `B1 · #${String(activeEntry.edition).padStart(3, '0')}`
        : activeMode === 'bonus-2'
          ? `B2 · #${String(activeEntry.edition).padStart(3, '0')}`
          : activeMode === 'practice'
            ? 'ARCHIVE'
            : `ZEN #${activeEntry.edition}`;

  const showResultCard =
    completion.isComplete &&
    engine.ignitionPhase === 'settled' &&
    scoreBreakdown !== null;

  return (
    <main className="relative flex flex-col items-center justify-between w-full h-screen bg-basalt-950 text-alabaster px-4 py-3 sm:py-5 overflow-hidden select-none">
      {/* Whisper-Quiet Top Sanctuary Bar */}
      <header className="w-full max-w-[496px] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open Sanctum Codex & Modes"
            title="Sanctum Codex"
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-basalt-850/90 border border-white/10 hover:border-brass/45 text-stone-300 hover:text-alabaster transition-colors cursor-pointer"
          >
            <svg
              viewBox="0 0 20 20"
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M3.5 6h13M3.5 10h9.5M3.5 14h13" />
            </svg>
          </button>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono tracking-[0.18em] uppercase text-brass shrink-0">
                {modeBadgeLabel}
              </span>
              <span className="text-stone-400">·</span>
              <h1
                className="text-sm sm:text-base font-semibold tracking-[0.12em] uppercase text-alabaster truncate"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {activeEntry.puzzle.name}
              </h1>
            </div>
            <span className="text-[11px] text-stone-300 tracking-wide truncate">
              {completion.isComplete
                ? activeEntry.puzzle.subtitle
                : `${completion.lockedCount} of ${completion.totalCount} strokes inlaid`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-basalt-900 border border-white/8 text-xs text-stone-300">
            <span className="font-mono tabular-nums">
              <span className="text-stone-400 mr-1">MV</span>
              <span className="text-alabaster">{engine.moves}</span>
            </span>

            {activeMode !== 'zen' && (
              <>
                <span className="text-white/15">|</span>
                <span className="text-alabaster">
                  <LiveTimer
                    startedAtMs={engine.startedAtMs}
                    completedAtMs={engine.completedAtMs}
                  />
                </span>
              </>
            )}
          </div>

          <SoundToggleButton />
        </div>
      </header>

      {/* Focused Basalt Astrolabe Stage (Zero Surrounding Clutter) */}
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

      {/* Whisper-Quiet Contextual Footer During Active Play */}
      <footer className="w-full max-w-[496px] min-h-[36px] flex items-center justify-between text-xs">
        {!completion.isComplete ? (
          <>
            <span
              className={`tracking-wide transition-opacity duration-500 ${
                engine.hasInteracted ? 'text-stone-400/75' : 'text-stone-300'
              }`}
            >
              Drag to inlay · Tap piece to rotate 45°
            </span>

            {engine.hasInteracted && (
              <button
                type="button"
                onClick={handleScatterCurrent}
                className="text-[11px] tracking-[0.14em] uppercase text-stone-300 hover:text-alabaster px-2.5 py-1 rounded-lg bg-basalt-900/90 border border-white/8 hover:border-white/20 transition-colors cursor-pointer"
              >
                Reset
              </button>
            )}
          </>
        ) : (
          <span className="mx-auto text-[11px] font-mono tracking-[0.2em] uppercase text-brass">
            {engine.ignitionPhase === 'igniting'
              ? 'Igniting Sigil…'
              : activeEntry.puzzle.subtitle}
          </span>
        )}
      </footer>

      {/* Single Authoritative End State (Reveals strictly after 1.08s ignition sweep settles) */}
      {showResultCard && scoreBreakdown && (
        <ResultCard
          mode={activeMode}
          edition={activeEntry.edition}
          puzzle={activeEntry.puzzle}
          completion={completion}
          score={scoreBreakdown}
          streak={effectiveStreak}
          personalRank={null}
          percentile={null}
          nextAction={nextAction}
          onReplay={handleScatterCurrent}
          onOpenSanctum={() => setDrawerOpen(true)}
        />
      )}

      {/* Slide-Over Sanctum Codex Drawer */}
      <SanctumDrawer
        open={drawerOpen}
        pack={pack}
        activeMode={activeMode}
        activePracticeKey={activePracticeKey}
        practiceCatalog={practiceCatalog}
        dailyUnlocked={dailyUnlocked}
        completedRecords={completedRecords}
        onClose={() => setDrawerOpen(false)}
        onSelectMode={selectMode}
        onSelectPractice={selectPracticeItem}
        onEnterZen={advanceZen}
        onScatterCurrent={handleScatterCurrent}
      />
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);