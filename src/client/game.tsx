import './index.css';

import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { calculateSigilScore } from '../shared/scoring';
import type { PuzzleCompletionStats } from '../shared/types';
import { LiveTimer } from './components/LiveTimer';
import { ResultCard } from './components/ResultCard';
import type { NextActionConfig } from './components/resultTypes';
import { SanctumDrawer } from './components/SanctumDrawer';
import type {
  CompletedSealRecord,
  SanctumTab,
} from './components/sanctumTypes';
import { SigilStage } from './components/SigilStage';
import { SoundToggleButton } from './components/SoundToggleButton';
import { useDailyPack } from './hooks/useDailyPack';
import { usePuzzleEngine } from './hooks/usePuzzleEngine';
import { useSession } from './hooks/useSession';
import {
  ensureActiveJourney,
  notifyAppReadyOnce,
  trackPuzzleCompletedJourney,
  trackStrokeLockedProgress,
} from './telemetry/journeys';
import {
  fetchDailyLeaderboard,
  submitPuzzleCompletion,
} from './utils/apiClient';

export const App = () => {
  const { session, updateSession } = useSession();
  const daily = useDailyPack(session?.dateKey, session?.username);

  const [reshuffleCount, setReshuffleCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<SanctumTab>('today');
  const [localRecords, setLocalRecords] = useState<
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

  // Narrow session properties for React Compiler memoization preservation
  const serverRecords = session?.completedRecords;
  const sessionDateKey = session?.dateKey;
  const sessionDailyCompleted = session?.dailyCompleted ?? false;
  const sessionStreak = session?.streak ?? 0;

  // Devvit Journeys: signal app-ready & start/reuse active journey when puzzle loads
  useEffect(() => {
    notifyAppReadyOnce();
    void ensureActiveJourney(activeEntry.mode, activeEntry.edition);
  }, [activeEntry.edition, activeEntry.mode]);

  const completedRecords = useMemo(() => {
    const merged = new Map<string, CompletedSealRecord>();

    if (serverRecords) {
      for (const rec of serverRecords) {
        merged.set(rec.seed, {
          seed: rec.seed,
          name: rec.name,
          silhouettePathD: rec.silhouettePathD,
          isPerfect: rec.isPerfect,
          bestScore: rec.bestScore,
        });
      }
    }

    for (const [seed, local] of localRecords.entries()) {
      const prev = merged.get(seed);
      if (!prev) {
        merged.set(seed, local);
      } else {
        merged.set(seed, {
          seed,
          name: local.name,
          silhouettePathD: local.silhouettePathD,
          isPerfect: prev.isPerfect || local.isPerfect,
          bestScore: Math.max(prev.bestScore, local.bestScore),
        });
      }
    }

    return merged;
  }, [localRecords, serverRecords]);

  const handlePuzzleComplete = useCallback(
    (stats: PuzzleCompletionStats) => {
      const breakdown = calculateSigilScore({
        moves: stats.moves,
        parMoves: stats.parMoves,
        elapsedMs: stats.elapsedMs,
        pieceCount: stats.totalCount,
      });

      trackPuzzleCompletedJourney({
        mode: activeEntry.mode,
        edition: activeEntry.edition,
        totalScore: breakdown.totalScore,
        moves: stats.moves,
        isPerfect: breakdown.isPerfect,
      });

      setLocalRecords((prev) => {
        const existing = prev.get(activeEntry.seed);
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

      void submitPuzzleCompletion({
        mode: activeEntry.mode,
        dateKey: activeEntry.dateKey,
        edition: activeEntry.edition,
        seed: activeEntry.seed,
        sigilName: activeEntry.puzzle.name,
        silhouettePathD: activeEntry.puzzle.unifiedSilhouettePathD,
        pieceCount: stats.totalCount,
        moves: stats.moves,
        parMoves: stats.parMoves,
        elapsedMs: stats.elapsedMs,
      }).then((serverRes) => {
        if (!serverRes) return;

        updateSession((prev) => {
          const filteredRecords = prev.completedRecords.filter(
            (r) => r.seed !== serverRes.record.seed
          );
          return {
            ...prev,
            streak: serverRes.streak,
            bestStreak: serverRes.bestStreak,
            communitySolves: serverRes.communitySolves,
            communityPulse: serverRes.communityPulse,
            dailyCompleted:
              prev.dailyCompleted || activeEntry.mode === 'daily',
            personalRank: serverRes.leaderboard.personalRank,
            percentile: serverRes.leaderboard.percentile,
            completedRecords: [serverRes.record, ...filteredRecords],
            leaderboard: serverRes.leaderboard,
          };
        });
      });
    },
    [
      activeEntry.dateKey,
      activeEntry.edition,
      activeEntry.mode,
      activeEntry.puzzle.name,
      activeEntry.puzzle.unifiedSilhouettePathD,
      activeEntry.seed,
      updateSession,
    ]
  );

  const handleRefreshLeaderboard = useCallback(() => {
    void fetchDailyLeaderboard(sessionDateKey).then((lb) => {
      if (!lb) return;
      updateSession((prev) => ({
        ...prev,
        personalRank: lb.personalRank,
        percentile: lb.percentile,
        leaderboard: lb,
      }));
    });
  }, [sessionDateKey, updateSession]);

  const handleMarkedCommentShared = useCallback(() => {
    updateSession((prev) => ({
      ...prev,
      commentSharedToday: true,
    }));
  }, [updateSession]);

  const seedKey = `${activeEntry.seed}:r${reshuffleCount}`;
  const engine = usePuzzleEngine(
    activeEntry.puzzle,
    seedKey,
    handlePuzzleComplete
  );
  const { completion } = engine;

  // Report Devvit Journey incremental progress whenever a new stroke locks in
  useEffect(() => {
    if (completion.lockedCount > 0 && !completion.isComplete) {
      trackStrokeLockedProgress(
        completion.lockedCount,
        completion.totalCount,
        activeEntry.mode
      );
    }
  }, [
    activeEntry.mode,
    completion.isComplete,
    completion.lockedCount,
    completion.totalCount,
  ]);

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
    sessionDailyCompleted || completedRecords.has(pack.main.seed);

  const effectiveStreak = useMemo(() => {
    if (!sessionDailyCompleted && completedRecords.has(pack.main.seed)) {
      return sessionStreak + 1;
    }
    return sessionStreak;
  }, [completedRecords, pack.main.seed, sessionDailyCompleted, sessionStreak]);

  const handleScatterCurrent = useCallback(() => {
    setReshuffleCount((c) => c + 1);
  }, []);

  const handleOpenLeaderboard = useCallback(() => {
    setDrawerTab('ranks');
    setDrawerOpen(true);
    handleRefreshLeaderboard();
  }, [handleRefreshLeaderboard]);

  const handleOpenSanctum = useCallback(() => {
    setDrawerTab('today');
    setDrawerOpen(true);
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
    <main className="relative flex flex-col items-center justify-between w-full h-dvh min-h-[480px] bg-basalt-950 text-alabaster px-4 py-3 sm:py-5 overflow-hidden select-none">
      <div className="sr-only" aria-live="polite">
        {completion.isComplete
          ? `${activeEntry.puzzle.name} reconstructed in ${engine.moves} moves.`
          : `${completion.lockedCount} of ${completion.totalCount} strokes inlaid.`}
      </div>
      {/* Whisper-Quiet Top Sanctuary Bar */}
      <header className="w-full max-w-[496px] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={handleOpenSanctum}
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

      {/* Single Authoritative End State (Hydrated with Live Rank, Community Pulse & Thread Share) */}
      {showResultCard && scoreBreakdown && (
        <ResultCard
          mode={activeMode}
          edition={activeEntry.edition}
          puzzle={activeEntry.puzzle}
          completion={completion}
          score={scoreBreakdown}
          streak={effectiveStreak}
          personalRank={session?.personalRank ?? null}
          percentile={session?.percentile ?? null}
          communityPulse={session?.communityPulse ?? null}
          isAuthenticated={session?.isAuthenticated ?? false}
          commentSharedToday={session?.commentSharedToday ?? false}
          onMarkedCommentShared={handleMarkedCommentShared}
          nextAction={nextAction}
          onReplay={handleScatterCurrent}
          onOpenLeaderboard={handleOpenLeaderboard}
          onOpenSanctum={handleOpenSanctum}
        />
      )}

      {/* Slide-Over Sanctum Codex Drawer */}
      <SanctumDrawer
        open={drawerOpen}
        activeTab={drawerTab}
        onTabChange={setDrawerTab}
        currentUsername={session?.username ?? 'wanderer'}
        streak={effectiveStreak}
        bestStreak={session?.bestStreak ?? effectiveStreak}
        pack={pack}
        leaderboard={session?.leaderboard ?? null}
        activeMode={activeMode}
        activePracticeKey={activePracticeKey}
        practiceCatalog={practiceCatalog}
        dailyUnlocked={dailyUnlocked}
        completedRecords={completedRecords}
        onRefreshLeaderboard={handleRefreshLeaderboard}
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