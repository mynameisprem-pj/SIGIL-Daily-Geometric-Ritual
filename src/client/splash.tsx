import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { getTodayUtcDateKey } from '../shared/constants';
import { buildDailySigilPack } from './engine/dailyPack';
import { useSession } from './hooks/useSession';
import {
  notifyAppReadyOnce,
  trackCommunityInteraction,
} from './telemetry/journeys';

export const Splash = () => {
  const { session } = useSession();
  const dateKey = session?.dateKey ?? getTodayUtcDateKey();

  useEffect(() => {
    notifyAppReadyOnce();
  }, []);

  const dailyPack = useMemo(() => buildDailySigilPack(dateKey), [dateKey]);
  const featuredSigil = dailyPack.main.puzzle;

  const pulse = session?.communityPulse;
  const solvesCount = pulse?.totalSolves ?? session?.communitySolves ?? 0;
  const jadeRate = pulse?.jadeRatePercent ?? 0;

  return (
    <button
      type="button"
      onClick={(e) => {
        trackCommunityInteraction(
          'splash_enter_game',
          `ed_${dailyPack.edition}`
        );
        requestExpandedMode(e.nativeEvent, 'game');
      }}
      className="relative flex flex-col items-center justify-between w-full h-full min-h-[340px] px-6 py-6 bg-basalt-950 text-alabaster cursor-pointer overflow-hidden select-none group border-0 text-center"
    >
      {/* Subtle carved tablet border inset */}
      <div className="pointer-events-none absolute inset-3 rounded-2xl border border-white/8 bg-basalt-900/55" />

      {/* Top Engraved Eyebrow */}
      <header className="z-10 flex items-center gap-2.5 text-[11px] font-medium tracking-[0.24em] uppercase text-stone-300">
        <span className="text-brass font-mono">
          #{String(dailyPack.edition).padStart(3, '0')}
        </span>
        <span className="w-1 h-1 rounded-full bg-brass/70" />
        <span>{dailyPack.main.tierLabel}</span>
      </header>

      {/* Center Medallion Preview + Engraved Title */}
      <div className="z-10 my-2 flex flex-col items-center gap-3">
        <div className="relative flex items-center justify-center w-32 h-32">
          <svg
            viewBox="110 110 300 300"
            className="w-full h-full transition-transform duration-500 ease-out group-hover:scale-105"
          >
            <circle
              cx="260"
              cy="260"
              r="134"
              fill="#08090d"
              stroke="rgba(229, 184, 105, 0.24)"
              strokeWidth="1.5"
            />
            <circle
              cx="260"
              cy="260"
              r="124"
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth="1"
              strokeDasharray="3 7"
            />
            <path
              d={featuredSigil.unifiedSilhouettePathD}
              fill="none"
              stroke="var(--color-brass)"
              strokeWidth="4.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={featuredSigil.unifiedSilhouettePathD}
              fill="none"
              stroke="var(--color-brass-bright)"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.7"
            />
          </svg>
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <h1
            className="text-2xl sm:text-[28px] font-semibold tracking-[0.22em] uppercase text-alabaster"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            SIGIL
          </h1>
          <p className="text-xs text-stone-300 tracking-wide">
            {featuredSigil.name} · Rotate and inlay strokes to ignite
          </p>
        </div>
      </div>

      {/* Primary Brass CTA + Live Community Ritual Pulse */}
      <footer className="z-10 flex flex-col items-center gap-2">
        <span className="inline-flex items-center gap-2 px-7 py-2.5 rounded-full bg-brass text-basalt-950 text-xs font-bold tracking-[0.18em] uppercase transition-colors duration-200 group-hover:bg-brass-bright">
          {session?.dailyCompleted ? 'Inspect Today’s Sigil' : 'Begin Ritual'}
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-stone-300 font-mono">
          <span>
            {session ? `${solvesCount} solved today` : 'Ready'}
          </span>
          {solvesCount > 0 && jadeRate > 0 && (
            <>
              <span className="text-stone-400">·</span>
              <span className="text-jade">◈ {jadeRate}% Jade</span>
            </>
          )}
          {session && session.streak > 0 && (
            <>
              <span className="text-stone-400">·</span>
              <span className="text-brass">{session.streak}d streak</span>
            </>
          )}
        </div>
      </footer>
    </button>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);