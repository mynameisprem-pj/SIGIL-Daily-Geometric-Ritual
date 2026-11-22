import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import * as React from 'react';
import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { calculateSigilScore } from '../shared/scoring';
import type { LeaderboardRow, PuzzleCompletionStats } from '../shared/types';
import { LiveTimer } from './components/LiveTimer';
import { ResultCard } from './components/ResultCard';
import type { NextActionConfig } from './components/resultTypes';
import type { CompletedSealRecord } from './components/sanctumTypes';
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

type CardView = 'play' | 'how-to-play' | 'archive' | 'leaderboard' | 'vault';

function computeSpectrumPercent(entry: LeaderboardRow): number {
  const clamped = Math.max(550, Math.min(1250, entry.score));
  return Math.round(10 + ((clamped - 550) / 700) * 82);
}

export const App = () => {
  const { session, updateSession } = useSession();
  const daily = useDailyPack(session?.dateKey, session?.username);

  const [reshuffleCount, setReshuffleCount] = useState(0);
  const [activeView, setActiveView] = useState<CardView>('play');
  const [showUnsolvedOnly, setShowUnsolvedOnly] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [localRecords, setLocalRecords] = useState(
    () => new Map<string, CompletedSealRecord>()
  );

  const menuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDownOutside = (ev: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDownOutside);
    return () => window.removeEventListener('pointerdown', onPointerDownOutside);
  }, [menuOpen]);

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

  const jadeVaultList = useMemo(
    () => [...completedRecords.values()].filter((r) => r.isPerfect),
    [completedRecords]
  );

  const allSealsList = useMemo(
    () => [...completedRecords.values()],
    [completedRecords]
  );

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

  const bestStreak = Math.max(session?.bestStreak ?? 0, effectiveStreak);

  const handleScatterCurrent = useCallback(() => {
    setReshuffleCount((c) => c + 1);
    setMenuOpen(false);
  }, []);

  const handleOpenLeaderboardView = useCallback(() => {
    setMenuOpen(false);
    setActiveView('leaderboard');
    handleRefreshLeaderboard();
  }, [handleRefreshLeaderboard]);

  const handleOpenJadeVault = useCallback(() => {
    setMenuOpen(false);
    setActiveView('vault');
  }, []);

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
      setMenuOpen(false);
      trackCommunityInteraction(
        'expand_fullscreen',
        `ed_${activeEntry.edition}`
      );
      try {
        requestExpandedMode(e.nativeEvent, 'game');
      } catch {
        // Safe fallback if already expanded
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

  const showResultCard =
    activeView === 'play' &&
    completion.isComplete &&
    engine.ignitionPhase === 'settled' &&
    scoreBreakdown !== null;

  const entries = session?.leaderboard?.entries ?? [];
  const solvesCount =
    session?.communityPulse?.totalSolves ?? session?.communitySolves ?? 0;
  const jadeRate = session?.communityPulse?.jadeRatePercent ?? 0;

  const archiveCards = useMemo(() => {
    const items = [
      {
        id: 'daily',
        title: `Challenge #${pack.edition} — ${pack.main.puzzle.name}`,
        strokes: pack.main.pieceCount,
        isCurrent: activeMode === 'daily',
        isTodayMain: true,
        locked: false,
        record: completedRecords.get(pack.main.seed) ?? null,
        onPlay: () => {
          selectMode('daily');
          setActiveView('play');
        },
      },
      {
        id: 'bonus-1',
        title: `Bonus I — ${pack.bonus1.puzzle.name}`,
        strokes: pack.bonus1.pieceCount,
        isCurrent: activeMode === 'bonus-1',
        isTodayMain: false,
        locked: !dailyUnlocked,
        record: completedRecords.get(pack.bonus1.seed) ?? null,
        onPlay: () => {
          if (!dailyUnlocked) return;
          selectMode('bonus-1');
          setActiveView('play');
        },
      },
      {
        id: 'bonus-2',
        title: `Bonus II — ${pack.bonus2.puzzle.name}`,
        strokes: pack.bonus2.pieceCount,
        isCurrent: activeMode === 'bonus-2',
        isTodayMain: false,
        locked: !dailyUnlocked,
        record: completedRecords.get(pack.bonus2.seed) ?? null,
        onPlay: () => {
          if (!dailyUnlocked) return;
          selectMode('bonus-2');
          setActiveView('play');
        },
      },
      ...practiceCatalog.map((item) => ({
        id: item.key,
        title: `${item.label} — ${item.entry.puzzle.name}`,
        strokes: item.entry.pieceCount,
        isCurrent: activeMode === 'practice' && activePracticeKey === item.key,
        isTodayMain: false,
        locked: false,
        record: completedRecords.get(item.entry.seed) ?? null,
        onPlay: () => {
          selectPracticeItem(item.key);
          setActiveView('play');
        },
      })),
    ];

    if (showUnsolvedOnly) {
      return items.filter((c) => !c.record);
    }
    return items;
  }, [
    activeMode,
    activePracticeKey,
    completedRecords,
    dailyUnlocked,
    pack,
    practiceCatalog,
    selectMode,
    selectPracticeItem,
    showUnsolvedOnly,
  ]);

  const headerSubtitle =
    activeMode === 'daily'
      ? `Challenge #${activeEntry.edition}`
      : activeMode === 'bonus-1'
        ? `Bonus I · #${activeEntry.edition}`
        : activeMode === 'bonus-2'
          ? `Bonus II · #${activeEntry.edition}`
          : activeMode === 'zen'
            ? `Zen Mode`
            : `Archive`;

  const liveProgressPct = Math.round(
    (completion.lockedCount / Math.max(1, completion.totalCount)) * 100
  );

  return (
    <main
      style={{
        touchAction: 'pan-y',
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      }}
      className="relative flex flex-col items-center justify-between w-full h-dvh min-h-[500px] bg-[#06080F] text-[#F8FAFC] px-4 py-3.5 sm:px-6 sm:py-4 overflow-hidden select-none"
    >
      {/* Subtle radial cool-slate glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(30, 41, 59, 0.28) 0%, rgba(6, 8, 15, 0) 70%)',
        }}
      />

      {/* ==================== FULL-CARD VIEW 1: HOW TO PLAY ==================== */}
      {activeView === 'how-to-play' && (
        <section className="z-20 relative flex flex-col justify-center w-full max-w-[540px] h-full px-3 sm:px-6 py-4 animate-reveal-rise">
          <button
            type="button"
            onClick={() => setActiveView('play')}
            aria-label="Close How to Play"
            className="absolute top-2 right-2 inline-flex items-center justify-center w-8 h-8 rounded-lg border border-white/25 hover:border-white/60 bg-white/5 hover:bg-white/10 text-white transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>

          <h2 className="text-2xl font-bold tracking-tight text-white mb-3">
            How to Play
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed mb-5">
            Reconstruct today’s shattered geometric seal by rotating and placing
            each stone stroke into the central astrolabe. Fewer moves earn higher
            subreddit rank.
          </p>

          <p className="text-sm font-semibold text-slate-200 mb-2.5">
            Controls & Mastery:
          </p>

          <ul className="space-y-2.5 text-sm text-slate-300 list-disc pl-5 mb-7">
            <li>
              <strong className="text-white">Tap a piece</strong> (or scroll your
              mouse wheel / tap <strong className="text-white">Rotate 45°</strong>)
              to turn it into alignment.
            </li>
            <li>
              <strong className="text-white">Drag into groove</strong> → locks in
              place with a musical chime when aligned.
            </li>
            <li>
              <strong className="text-emerald-300">Jade Seal</strong> → solve
              within <strong className="text-white">+2 moves of par</strong> for
              perfect mastery.
            </li>
            <li>
              <strong className="text-sky-300">Bonus Challenges</strong> → unlock 2
              harder seals every day after finishing the main challenge.
            </li>
          </ul>

          <button
            type="button"
            onClick={() => setActiveView('play')}
            className="w-full max-w-[240px] py-2.5 px-6 rounded-full bg-white hover:bg-slate-100 text-slate-950 text-sm font-bold transition-colors cursor-pointer shadow-lg"
          >
            Back to Game
          </button>
        </section>
      )}

      {/* ==================== FULL-CARD VIEW 2: PLAY THE ARCHIVE ==================== */}
      {activeView === 'archive' && (
        <section className="z-20 relative flex flex-col w-full max-w-[540px] h-full px-2 sm:px-4 py-2 animate-reveal-rise">
          <button
            type="button"
            onClick={() => setActiveView('play')}
            aria-label="Close Archive"
            className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-8 h-8 rounded-lg border border-white/25 hover:border-white/60 bg-white/5 hover:bg-white/10 text-white transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>

          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Play the archive
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5 mb-3">
            Jump into today’s bonus seals or practice challenges.
          </p>

          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => setShowUnsolvedOnly((v) => !v)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                showUnsolvedOnly
                  ? 'bg-white text-slate-950 border-white'
                  : 'bg-[#121723] text-slate-200 border-white/15 hover:border-white/35'
              }`}
            >
              Show unsolved
            </button>

            <button
              type="button"
              onClick={() => {
                advanceZen();
                setActiveView('play');
              }}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#121723] text-emerald-300 border border-emerald-500/30 hover:border-emerald-400/60 transition-colors cursor-pointer"
            >
              ∞ Zen Mode
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-2">
            {archiveCards.map((card) => (
              <div
                key={card.id}
                className={`rounded-2xl p-4 border transition-colors ${
                  card.isCurrent
                    ? 'bg-[#0C192C] border-sky-500/35'
                    : 'bg-[#10141F] border-white/8'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-sm sm:text-base font-bold text-white">
                    {card.title}
                  </span>
                  {card.isCurrent && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/20 text-sky-300">
                      Current
                    </span>
                  )}
                  {card.record ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300">
                      {card.record.isPerfect ? 'Jade Seal' : 'Solved'}
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/8 text-slate-300">
                      Not played
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-3.5 text-xs">
                  <span className="px-2.5 py-0.5 rounded-full bg-white/8 text-slate-200 font-medium">
                    Score {card.record ? card.record.bestScore : '—'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-teal-500/15 text-teal-300 font-medium">
                    {card.strokes} Strokes
                  </span>
                  {card.isTodayMain && solvesCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium">
                      Solves {solvesCount}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={card.locked}
                  onClick={card.onPlay}
                  className={`w-full py-2 rounded-full text-xs font-bold tracking-wide uppercase transition-colors ${
                    card.locked
                      ? 'bg-white/10 text-slate-400 cursor-not-allowed'
                      : 'bg-white hover:bg-slate-100 text-slate-950 cursor-pointer'
                  }`}
                >
                  {card.locked
                    ? 'Solve Main Challenge First'
                    : card.isCurrent
                      ? 'CONTINUE'
                      : 'PLAY'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ==================== FULL-CARD VIEW 3: LEADERBOARD ==================== */}
      {activeView === 'leaderboard' && (
        <section className="z-20 relative flex flex-col w-full max-w-[540px] h-full px-2 sm:px-4 py-2 animate-reveal-rise">
          <button
            type="button"
            onClick={() => setActiveView('play')}
            aria-label="Close Standings"
            className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-8 h-8 rounded-lg border border-white/25 hover:border-white/60 bg-white/5 hover:bg-white/10 text-white transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>

          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Challenge #{pack.edition} Standings
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5 mb-4">
            {solvesCount > 0
              ? `${solvesCount} players finished · ${jadeRate}% earned a Jade Seal`
              : 'Be the first player on the board today!'}
          </p>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 pb-2">
            {entries.length === 0 ? (
              <div className="rounded-2xl bg-[#10141F] border border-white/8 p-6 text-center text-sm text-slate-300">
                No scores recorded for Challenge #{pack.edition} yet.
              </div>
            ) : (
              entries.map((row) => (
                <div
                  key={row.username}
                  className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#10141F] border border-white/8"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-bold text-slate-400 w-6">
                      #{row.rank}
                    </span>
                    {row.snoovatarUrl ? (
                      <img
                        src={row.snoovatarUrl}
                        alt=""
                        className="w-7 h-7 object-contain shrink-0"
                      />
                    ) : (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-xs font-bold text-white shrink-0">
                        {row.username.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-white truncate">
                      u/{row.username}
                    </span>
                    {row.isPerfect && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300">
                        Jade
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold text-white">
                      {row.score}
                    </span>
                    <span className="text-xs text-slate-400 ml-1">pts</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={() => setActiveView('play')}
            className="mt-2 w-full py-2.5 rounded-full bg-white hover:bg-slate-100 text-slate-950 text-xs font-bold uppercase tracking-wide cursor-pointer"
          >
            Back to Game
          </button>
        </section>
      )}

      {/* ==================== FULL-CARD VIEW 4: JADE SEAL VAULT (MODERNIZED!) ==================== */}
      {activeView === 'vault' && (
        <section className="z-20 relative flex flex-col w-full max-w-[540px] h-full px-2 sm:px-4 py-2 animate-reveal-rise">
          <button
            type="button"
            onClick={() => setActiveView('play')}
            aria-label="Close Jade Vault"
            className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-8 h-8 rounded-lg border border-white/25 hover:border-white/60 bg-white/5 hover:bg-white/10 text-white transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>

          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Jade Seal Vault
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5 mb-3">
            Permanent crests earned by solving challenges within +2 moves of par.
          </p>

          {/* Clean Status Pills Row */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300">
              ◈ {jadeVaultList.length} Jade {jadeVaultList.length === 1 ? 'Seal' : 'Seals'}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300">
              {allSealsList.length} Total Solved
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300">
              Streak {effectiveStreak}d · Best {bestStreak}d
            </span>
          </div>

          {/* Crisp 2-Column Seal Showcase Grid */}
          <div className="flex-1 overflow-y-auto pr-1 pb-2">
            {allSealsList.length === 0 ? (
              <div className="rounded-2xl bg-[#10141F] border border-white/8 p-8 text-center">
                <p className="text-sm font-semibold text-white mb-1">
                  Your vault is waiting for its first seal
                </p>
                <p className="text-xs text-slate-400">
                  Complete today’s challenge within +2 moves of par to forge your
                  first glowing Jade crest.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {allSealsList.map((seal) => (
                  <div
                    key={seal.seed}
                    className={`flex flex-col items-center justify-between p-4 rounded-2xl border transition-colors ${
                      seal.isPerfect
                        ? 'bg-[#0B1917] border-emerald-500/30'
                        : 'bg-[#10141F] border-white/8'
                    }`}
                  >
                    <div className="w-16 h-16 flex items-center justify-center mb-2">
                      <svg viewBox="115 115 290 290" className="w-full h-full">
                        <circle
                          cx="260"
                          cy="260"
                          r="128"
                          fill="none"
                          stroke="rgba(255,255,255,0.06)"
                          strokeWidth="1.5"
                        />
                        <path
                          d={seal.silhouettePathD}
                          fill="none"
                          stroke={seal.isPerfect ? '#6BC4A6' : '#E5B869'}
                          strokeWidth="5.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>

                    <span className="text-sm font-bold text-white text-center truncate w-full">
                      {seal.name}
                    </span>

                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          seal.isPerfect
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {seal.isPerfect ? 'Jade' : 'Brass'}
                      </span>
                      <span className="text-xs font-semibold text-slate-300">
                        {seal.bestScore} pts
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setActiveView('play')}
            className="mt-2 w-full py-2.5 rounded-full bg-white hover:bg-slate-100 text-slate-950 text-xs font-bold uppercase tracking-wide cursor-pointer"
          >
            Back to Game
          </button>
        </section>
      )}

      {/* ==================== MAIN PLAY VIEW ==================== */}
      {activeView === 'play' && (
        <>
          {/* Top Bar: Clean Brand + 4-Icon Action Cluster + Dropdown Menu */}
          <header className="z-20 w-full max-w-[490px] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#111624] border border-white/10 shrink-0">
                <span className="text-emerald-300 text-sm">◈</span>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-bold tracking-tight text-white truncate">
                    {activeEntry.puzzle.name}
                  </span>
                  <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/15 text-sky-300">
                    {headerSubtitle}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span>
                    {completion.lockedCount} of {completion.totalCount} placed
                  </span>
                  <span>·</span>
                  <span>{engine.moves} moves</span>
                  {activeMode !== 'zen' && (
                    <>
                      <span>·</span>
                      <LiveTimer
                        startedAtMs={engine.startedAtMs}
                        completedAtMs={engine.completedAtMs}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 4-Button Cluster: (i) | Sound | Archive | Menu (≡) */}
            <div ref={menuRef} className="relative flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setActiveView('how-to-play')}
                aria-label="How to Play"
                title="How to Play"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#111624] hover:bg-[#1A2236] border border-white/10 text-slate-200 transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <circle cx="10" cy="10" r="7.2" />
                  <path d="M10 9v4.2M10 6.5h.01" strokeLinecap="round" />
                </svg>
              </button>

              <SoundToggleButton />

              <button
                type="button"
                onClick={() => setActiveView('archive')}
                aria-label="Play the Archive"
                title="Play the Archive"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#111624] hover:bg-[#1A2236] border border-white/10 text-slate-200 transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3.5" y="4.5" width="13" height="3" rx="0.8" />
                  <path d="M4.8 7.5v7.2a1.3 1.3 0 0 0 1.3 1.3h7.8a1.3 1.3 0 0 0 1.3-1.3V7.5M8.2 11h3.6" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Menu"
                title="Menu"
                className={`inline-flex items-center justify-center w-9 h-9 rounded-full border transition-colors cursor-pointer ${
                  menuOpen
                    ? 'bg-white text-slate-950 border-white'
                    : 'bg-[#111624] hover:bg-[#1A2236] border-white/10 text-slate-200'
                }`}
              >
                <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M4 6.5h12M4 10h12M4 13.5h12" />
                </svg>
              </button>

              {/* Floating Glass Dropdown Menu */}
              {menuOpen && (
                <div className="absolute right-0 top-11 z-40 w-48 rounded-xl bg-[#111624]/98 border border-white/15 py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.75)] backdrop-blur-md">
                  <button
                    type="button"
                    onClick={handleRequestExpand}
                    className="w-full text-left px-4 py-2 text-sm font-medium text-slate-100 hover:bg-white/8 transition-colors cursor-pointer"
                  >
                    Toggle Fullscreen
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenLeaderboardView}
                    className="w-full text-left px-4 py-2 text-sm font-medium text-slate-100 hover:bg-white/8 transition-colors cursor-pointer"
                  >
                    Standings (#{pack.edition})
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenJadeVault}
                    className="w-full text-left px-4 py-2 text-sm font-medium text-slate-100 hover:bg-white/8 transition-colors cursor-pointer"
                  >
                    Jade Seal Vault
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      advanceZen();
                    }}
                    className="w-full text-left px-4 py-2 text-sm font-medium text-slate-100 hover:bg-white/8 transition-colors cursor-pointer"
                  >
                    Zen Mode
                  </button>
                  <button
                    type="button"
                    onClick={handleScatterCurrent}
                    className="w-full text-left px-4 py-2 text-sm font-medium text-slate-100 hover:bg-white/8 transition-colors cursor-pointer"
                  >
                    Reset Pieces
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setActiveView('how-to-play');
                    }}
                    className="w-full text-left px-4 py-2 text-sm font-medium text-slate-100 hover:bg-white/8 transition-colors cursor-pointer"
                  >
                    How to Play
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* Center Puzzle Stage */}
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

          {/* Upgraded Footer: Controls + Cool Glass Mastery Spectrum Dock */}
          <footer className="z-10 w-full max-w-[490px] flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              {!completion.isComplete ? (
                <button
                  type="button"
                  onClick={handleRotateActivePieceButton}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#141B2D] hover:bg-[#1E2942] active:scale-95 border border-white/12 text-xs font-semibold text-white transition-all cursor-pointer"
                >
                  <span>↻</span>
                  <span>Rotate 45°</span>
                </button>
              ) : (
                <span className="text-xs font-semibold text-emerald-300">
                  Sigil Reconstructed!
                </span>
              )}

              <span className="text-xs text-slate-400 truncate">
                {solvesCount > 0
                  ? `${jadeRate}% of ${solvesCount} ${solvesCount === 1 ? 'player' : 'players'} earned Jade`
                  : `Par ${completion.parMoves} moves · Tap piece to rotate`}
              </span>

              <button
                type="button"
                onClick={() => setActiveView('how-to-play')}
                className="px-3.5 py-1.5 rounded-full bg-[#141B2D] hover:bg-[#1E2942] border border-white/10 text-xs font-semibold text-slate-200 transition-colors cursor-pointer shrink-0"
              >
                How to Play
              </button>
            </div>

            {/* Cool Glass Mastery Spectrum Capsule (Live Alignment + Community Snoovatars!) */}
            <button
              type="button"
              onClick={handleOpenLeaderboardView}
              title="Click to view Challenge Standings"
              className="group relative flex items-center gap-2.5 w-full px-3 py-2 rounded-2xl bg-[#0D121F]/90 hover:bg-[#12192B] border border-white/8 hover:border-white/18 transition-colors cursor-pointer"
            >
              {/* Left Progress Counter Pill */}
              <span className="text-[11px] font-bold text-sky-300 tabular-nums shrink-0">
                {liveProgressPct}%
              </span>

              {/* Illuminated Track */}
              <div className="relative flex-1 h-2 rounded-full bg-white/8 overflow-visible">
                {/* Active Gradient Fill */}
                <div
                  style={{
                    width: `${Math.max(entries.length > 0 ? 100 : liveProgressPct, liveProgressPct)}%`,
                    opacity: entries.length > 0 && liveProgressPct === 0 ? 0.45 : 1,
                  }}
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 via-amber-300 to-emerald-400 transition-all duration-300"
                />

                {/* Live Glowing Spark for Current Player's Stroke Progress */}
                {!completion.isComplete && liveProgressPct > 0 && (
                  <span
                    style={{ left: `${liveProgressPct}%` }}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.95)] border-2 border-sky-400 transition-all duration-300"
                  />
                )}

                {/* Community Snoovatars Standing Along the Track */}
                {entries.slice(0, 7).map((entry) => (
                  <div
                    key={entry.username}
                    style={{ left: `${computeSpectrumPercent(entry)}%` }}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                  >
                    {entry.snoovatarUrl ? (
                      <img
                        src={entry.snoovatarUrl}
                        alt={`u/${entry.username}`}
                        className="w-7 h-7 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] transition-transform group-hover:scale-110"
                      />
                    ) : (
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-slate-950 shadow-md ${
                          entry.isPerfect ? 'bg-emerald-300' : 'bg-amber-300'
                        }`}
                      >
                        {entry.username.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Right Jade Mastery Badge */}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/25 text-[10px] font-bold text-emerald-300 shrink-0">
                <span>◈</span>
                <span>Jade</span>
              </span>
            </button>
          </footer>
        </>
      )}

      {/* Completion Result Overlay */}
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
          onOpenLeaderboard={handleOpenLeaderboardView}
          onOpenSanctum={handleOpenJadeVault}
        />
      )}
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);