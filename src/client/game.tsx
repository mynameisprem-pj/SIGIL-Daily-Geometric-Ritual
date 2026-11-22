import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import * as React from 'react';
import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { calculateSigilScore } from '../shared/scoring';
import type { LeaderboardRow, PuzzleCompletionStats } from '../shared/types';
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
  trackCommunityInteraction,
  trackPuzzleCompletedJourney,
  trackStrokeLockedProgress,
} from './telemetry/journeys';
import {
  fetchDailyLeaderboard,
  submitPuzzleCompletion,
} from './utils/apiClient';

function computeSpectrumPercent(entry: LeaderboardRow): number {
  const clamped = Math.max(550, Math.min(1250, entry.score));
  return Math.round(10 + ((clamped - 550) / 700) * 82);
}

export const App = () => {
  const { session, updateSession } = useSession();
  const daily = useDailyPack(session?.dateKey, session?.username);

  const [reshuffleCount, setReshuffleCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<SanctumTab>('today');
  const [showHowToPlay, setShowHowToPlay] = useState(false);
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

  const serverRecords = session?.completedRecords;
  const sessionDateKey = session?.dateKey;
  const sessionDailyCompleted = session?.dailyCompleted ?? false;
  const sessionStreak = session?.streak ?? 0;

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

  // Dedicated mobile-friendly Rotate button action (rotates selected piece, or picks first unlocked piece)
  const handleRotateActivePieceButton = useCallback(() => {
    if (completion.isComplete) return;
    const unlocked = engine.states.filter((s) => !s.locked);
    if (unlocked.length === 0) return;

    const activeUnlocked = unlocked.find(
      (s) => s.id === engine.selectedPieceId
    );
    const targetId = activeUnlocked ? activeUnlocked.id : unlocked[0]!.id;
    engine.selectAndBringToFront(targetId);
    engine.rotatePiece(targetId, 1);
  }, [completion.isComplete, engine]);

  const handleRequestExpand = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      trackCommunityInteraction(
        'expand_fullscreen',
        `ed_${activeEntry.edition}`
      );
      try {
        requestExpandedMode(e.nativeEvent, 'game');
      } catch {
        // Already in expanded mode or standalone tab
      }
    },
    [activeEntry.edition]
  );

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

  const entries = session?.leaderboard?.entries ?? [];
  const solvesCount =
    session?.communityPulse?.totalSolves ?? session?.communitySolves ?? 0;
  const jadeRate = session?.communityPulse?.jadeRatePercent ?? 0;

  return (
    <main
      style={{ touchAction: 'pan-y' }}
      className="relative flex flex-col items-center justify-between w-full h-dvh min-h-[480px] bg-basalt-950 text-alabaster px-3.5 py-2.5 sm:px-5 sm:py-4 overflow-hidden select-none"
    >
      <div className="sr-only" aria-live="polite">
        {completion.isComplete
          ? `${activeEntry.puzzle.name} reconstructed in ${engine.moves} moves.`
          : `${completion.lockedCount} of ${completion.totalCount} strokes inlaid.`}
      </div>

      {/* r/HotAndCold-Style Unified Top Bar: Sigil Identity (Left) + Glass Action Cluster (Right) */}
      <header className="w-full max-w-[468px] flex items-center justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono font-semibold tracking-[0.16em] uppercase text-brass shrink-0">
              {modeBadgeLabel}
            </span>
            <span className="text-stone-400">·</span>
            <h1
              className="text-sm sm:text-base font-semibold tracking-[0.1em] uppercase text-alabaster truncate"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {activeEntry.puzzle.name}
            </h1>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-stone-300 font-mono">
            <span>
              {completion.lockedCount}/{completion.totalCount} inlaid
            </span>
            <span className="text-white/15">·</span>
            <span>MV {engine.moves}</span>
            {activeMode !== 'zen' && (
              <>
                <span className="text-white/15">·</span>
                <LiveTimer
                  startedAtMs={engine.startedAtMs}
                  completedAtMs={engine.completedAtMs}
                />
              </>
            )}
          </div>
        </div>

        {/* Clean Top-Right Circular Icon Cluster */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowHowToPlay((v) => !v)}
            aria-label="How to Play"
            title="How to Play"
            className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors cursor-pointer ${
              showHowToPlay
                ? 'bg-brass text-basalt-950 border-brass'
                : 'bg-basalt-850/90 border-white/10 hover:border-brass/45 text-stone-300 hover:text-alabaster'
            }`}
          >
            <span className="text-xs font-serif font-bold italic">i</span>
          </button>

          <SoundToggleButton />

          <button
            type="button"
            onClick={handleOpenLeaderboard}
            aria-label="Leaderboard"
            title="Leaderboard"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-basalt-850/90 border border-white/10 hover:border-brass/45 text-stone-300 hover:text-alabaster transition-colors cursor-pointer"
          >
            <svg
              viewBox="0 0 20 20"
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 16h8M10 12v4M5.5 4h9v3.5a4.5 4.5 0 0 1-9 0V4Z" />
              <path d="M5.5 5.5H3.5v1.5a2.5 2.5 0 0 0 2 2.45M14.5 5.5h2v1.5a2.5 2.5 0 0 1-2 2.45" />
            </svg>
          </button>

          <button
            type="button"
            onClick={handleOpenSanctum}
            aria-label="Modes & Vault"
            title="Modes & Vault"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-basalt-850/90 border border-white/10 hover:border-brass/45 text-stone-300 hover:text-alabaster transition-colors cursor-pointer"
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

          <button
            type="button"
            onClick={handleRequestExpand}
            aria-label="Expand Fullscreen"
            title="Expand Fullscreen"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-basalt-850/90 border border-white/10 hover:border-brass/45 text-stone-300 hover:text-alabaster transition-colors cursor-pointer"
          >
            <svg
              viewBox="0 0 20 20"
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 8V4h4M16 8V4h-4M4 12v4h4M16 12v4h-4" />
            </svg>
          </button>
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

      {/* Bottom Thumb Action Row + Live Reddit Snoovatar Spectrum */}
      <footer className="w-full max-w-[468px] flex flex-col gap-1.5">
        {!completion.isComplete ? (
          <div className="flex items-center justify-between gap-2">
            {/* Effortless Mobile Thumb Rotate Pill */}
            <button
              type="button"
              onClick={handleRotateActivePieceButton}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-basalt-850 hover:bg-basalt-800 active:scale-95 border border-brass/35 text-xs font-semibold tracking-[0.08em] text-alabaster transition-all cursor-pointer"
            >
              <span className="text-brass text-sm leading-none">↻</span>
              <span>Rotate 45°</span>
            </button>

            <span className="text-[11px] text-stone-300 font-mono truncate">
              {solvesCount > 0
                ? `${solvesCount} solved${jadeRate > 0 ? ` · ${jadeRate}% Jade` : ''}`
                : 'Drag stroke into stone groove'}
            </span>

            {engine.hasInteracted ? (
              <button
                type="button"
                onClick={handleScatterCurrent}
                className="px-3 py-1.5 rounded-full bg-basalt-900 border border-white/10 hover:border-white/25 text-[11px] font-medium tracking-[0.1em] uppercase text-stone-300 hover:text-alabaster transition-colors cursor-pointer"
              >
                Reset
              </button>
            ) : (
              <span className="text-[11px] font-mono text-brass shrink-0">
                par {completion.parMoves}
              </span>
            )}
          </div>
        ) : (
          <div className="text-center text-[11px] font-mono tracking-[0.2em] uppercase text-brass">
            {engine.ignitionPhase === 'igniting'
              ? 'Igniting Sigil…'
              : activeEntry.puzzle.subtitle}
          </div>
        )}

        {/* r/HotAndCold-Style Bottom Snoovatar Mastery Spectrum */}
        {entries.length > 0 && (
          <div className="relative flex items-center w-full h-5 px-1">
            <span className="text-[9px] font-mono text-stone-400 pr-1.5">
              ◇
            </span>
            <div className="relative flex-1 h-[2px] rounded-full bg-gradient-to-r from-stone-400/35 via-brass/75 to-jade">
              {entries.slice(0, 6).map((entry) => (
                <div
                  key={entry.username}
                  title={`u/${entry.username} · ${entry.score} pts`}
                  style={{ left: `${computeSpectrumPercent(entry)}%` }}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                >
                  {entry.snoovatarUrl ? (
                    <img
                      src={entry.snoovatarUrl}
                      alt={`u/${entry.username}`}
                      className={`w-5 h-5 object-contain rounded-full bg-basalt-900 border ${
                        entry.isPerfect ? 'border-jade' : 'border-brass/70'
                      }`}
                    />
                  ) : (
                    <span
                      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold uppercase bg-basalt-900 border ${
                        entry.isPerfect
                          ? 'border-jade text-jade'
                          : 'border-brass text-brass'
                      }`}
                    >
                      {entry.username.slice(0, 1)}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <span className="text-[10px] font-mono text-jade pl-1.5">◈</span>
          </div>
        )}
      </footer>

      {/* Clean Quick "How to Play" Overlay */}
      {showHowToPlay && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-basalt-950/85 animate-reveal-rise">
          <div className="w-full max-w-[380px] rounded-2xl bg-basalt-900 border border-brass/40 p-5 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="text-xs font-mono tracking-[0.2em] uppercase text-brass">
                How to Play SIGIL
              </span>
              <button
                type="button"
                onClick={() => setShowHowToPlay(false)}
                className="text-xs text-stone-300 hover:text-alabaster px-2 py-0.5 rounded bg-basalt-850 border border-white/10 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <ul className="space-y-2.5 text-xs text-stone-300 leading-relaxed">
              <li>
                <strong className="text-alabaster">1. Rotate:</strong> Tap any
                white stone piece (or tap{' '}
                <span className="text-brass font-semibold">↻ Rotate 45°</span>)
                to match the carved groove’s angle.
              </li>
              <li>
                <strong className="text-alabaster">2. Drag & Inlay:</strong>{' '}
                Drag the piece into the center astrolabe until it snaps in
                Molten Brass.
              </li>
              <li>
                <strong className="text-jade">3. Pale Jade Seal:</strong>{' '}
                Complete within <strong>+2 moves of par</strong> to ignite the
                altar in Pale Jade and unlock Bonus Seals!
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setShowHowToPlay(false)}
              className="w-full py-2.5 rounded-full bg-brass hover:bg-brass-bright text-basalt-950 text-xs font-extrabold tracking-[0.16em] uppercase cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Single Authoritative End State */}
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