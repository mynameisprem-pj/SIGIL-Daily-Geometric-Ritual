import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import * as React from 'react';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getTodayUtcDateKey } from '../shared/constants';
import type { LeaderboardRow } from '../shared/types';
import { SoundToggleButton } from './components/SoundToggleButton';
import { buildDailySigilPack } from './engine/dailyPack';
import { useSession } from './hooks/useSession';
import {
  notifyAppReadyOnce,
  trackCommunityInteraction,
} from './telemetry/journeys';

type InlineOverlay = 'none' | 'rules' | 'ranks';

function computeSpectrumPercent(entry: LeaderboardRow): number {
  // Map scores smoothly from 550..1250 across 12%..92% of the bottom spectrum bar
  const clamped = Math.max(550, Math.min(1250, entry.score));
  const normalized = (clamped - 550) / 700;
  return Math.round(12 + normalized * 80);
}

export const Splash = () => {
  const { session } = useSession();
  const dateKey = session?.dateKey ?? getTodayUtcDateKey();
  const [overlay, setOverlay] = useState<InlineOverlay>('none');

  useEffect(() => {
    notifyAppReadyOnce();
  }, []);

  const dailyPack = useMemo(() => buildDailySigilPack(dateKey), [dateKey]);
  const featuredSigil = dailyPack.main.puzzle;

  const pulse = session?.communityPulse;
  const solvesCount = pulse?.totalSolves ?? session?.communitySolves ?? 0;
  const jadeRate = pulse?.jadeRatePercent ?? 0;
  const entries = session?.leaderboard?.entries ?? [];

  const launchGame = (e: React.MouseEvent<HTMLButtonElement>) => {
    trackCommunityInteraction('splash_enter_game', `ed_${dailyPack.edition}`);
    requestExpandedMode(e.nativeEvent, 'game');
  };

  const socialProofLine = !session
    ? 'Synchronizing stone altar…'
    : solvesCount === 0
      ? `Be the first Scribe to ignite Seal #${String(dailyPack.edition).padStart(3, '0')}`
      : jadeRate > 0
        ? `${jadeRate}% of ${solvesCount} ${solvesCount === 1 ? 'Scribe' : 'Scribes'} earned the Pale Jade Seal`
        : `${solvesCount} ${solvesCount === 1 ? 'Scribe has' : 'Scribes have'} reconstructed this Sigil`;

  return (
    <div className="relative flex flex-col items-center justify-between w-full h-full min-h-[380px] px-5 py-4 sm:px-7 sm:py-5 bg-basalt-950 text-alabaster overflow-hidden select-none">
      {/* Subtle carved obsidian frame */}
      <div className="pointer-events-none absolute inset-2.5 rounded-2xl border border-white/8 bg-basalt-900/50" />

      {/* Top Bar: Edition Badge (Left) + Glass Utility Cluster (Right) */}
      <header className="z-20 w-full flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-basalt-900/90 border border-white/8 text-[11px] font-medium tracking-[0.2em] uppercase text-stone-300">
          <span className="text-brass font-mono font-semibold">
            #{String(dailyPack.edition).padStart(3, '0')}
          </span>
          <span className="w-1 h-1 rounded-full bg-brass/70" />
          <span className="truncate">{dailyPack.main.tierLabel}</span>
        </div>

        {/* r/HotAndCold-style Top-Right Action Cluster */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setOverlay((prev) => (prev === 'rules' ? 'none' : 'rules'))
            }
            aria-label="How to Play"
            title="How to Play"
            className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors cursor-pointer ${
              overlay === 'rules'
                ? 'bg-brass text-basalt-950 border-brass'
                : 'bg-basalt-850/90 border-white/10 hover:border-brass/45 text-stone-300 hover:text-alabaster'
            }`}
          >
            <span className="text-xs font-serif font-bold italic">i</span>
          </button>

          <SoundToggleButton />

          <button
            type="button"
            onClick={() =>
              setOverlay((prev) => (prev === 'ranks' ? 'none' : 'ranks'))
            }
            aria-label="Edition Standings"
            title="Edition Standings"
            className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors cursor-pointer ${
              overlay === 'ranks'
                ? 'bg-brass text-basalt-950 border-brass'
                : 'bg-basalt-850/90 border-white/10 hover:border-brass/45 text-stone-300 hover:text-alabaster'
            }`}
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
        </div>
      </header>

      {/* Center Interactive Hero */}
      <div className="z-10 my-1 flex flex-col items-center text-center">
        <button
          type="button"
          onClick={launchGame}
          aria-label={`Play ${featuredSigil.name}`}
          className="group relative flex items-center justify-center w-28 h-28 sm:w-32 sm:h-32 bg-transparent border-0 cursor-pointer p-0"
        >
          <svg
            viewBox="110 110 300 300"
            className="w-full h-full transition-transform duration-500 ease-out group-hover:scale-105"
          >
            <circle
              cx="260"
              cy="260"
              r="134"
              fill="#08090d"
              stroke="rgba(229, 184, 105, 0.28)"
              strokeWidth="1.6"
            />
            <circle
              cx="260"
              cy="260"
              r="123"
              fill="none"
              stroke="rgba(255, 255, 255, 0.09)"
              strokeWidth="1"
              strokeDasharray="3 7"
            />
            <path
              d={featuredSigil.unifiedSilhouettePathD}
              fill="none"
              stroke="var(--color-brass)"
              strokeWidth="4.4"
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
              opacity="0.75"
            />
          </svg>
        </button>

        <h1
          className="mt-1.5 text-xl sm:text-2xl font-semibold tracking-[0.22em] uppercase text-alabaster"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {featuredSigil.name}
        </h1>

        <p className="mt-0.5 text-xs text-stone-300">
          Can you reconstruct today’s shattered sacred rune?
        </p>

        {/* Primary & Secondary CTA Row */}
        <div className="mt-3 flex items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={launchGame}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-brass hover:bg-brass-bright text-basalt-950 text-xs font-extrabold tracking-[0.16em] uppercase transition-colors cursor-pointer shadow-[0_0_24px_rgba(229,184,105,0.22)]"
          >
            {session?.dailyCompleted ? 'Continue Ritual' : 'Begin Ritual'}
          </button>

          <button
            type="button"
            onClick={() => setOverlay('rules')}
            className="inline-flex items-center px-4 py-2.5 rounded-full bg-basalt-850 hover:bg-basalt-800 border border-white/12 hover:border-white/25 text-xs font-medium tracking-[0.08em] text-stone-300 hover:text-alabaster transition-colors cursor-pointer"
          >
            How to Play
          </button>
        </div>

        {/* Social Proof Stat Line */}
        <p className="mt-2 text-[11px] text-stone-300 font-mono">
          {socialProofLine}
          {session && session.streak > 0 ? (
            <span className="text-brass"> · {session.streak}d streak</span>
          ) : null}
        </p>
      </div>

      {/* Bottom Live Snoovatar Mastery Spectrum Bar (r/HotAndCold-inspired) */}
      <footer className="z-10 w-full max-w-[440px] pt-3 pb-0.5 px-2">
        <div className="relative flex items-center w-full h-7">
          {/* Left Origin Glyph */}
          <span
            title="Scattered Stone"
            className="z-10 text-[10px] font-mono uppercase tracking-widest text-stone-400 pr-2 shrink-0"
          >
            ◇
          </span>

          {/* Brass -> Jade Spectrum Line */}
          <div className="relative flex-1 h-[2px] rounded-full bg-gradient-to-r from-stone-400/40 via-brass/80 to-jade">
            {entries.slice(0, 6).map((entry) => {
              const leftPct = computeSpectrumPercent(entry);
              return (
                <div
                  key={entry.username}
                  title={`u/${entry.username} · ${entry.score} pts${entry.isPerfect ? ' (Jade Seal)' : ''}`}
                  style={{ left: `${leftPct}%` }}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                >
                  {entry.snoovatarUrl ? (
                    <img
                      src={entry.snoovatarUrl}
                      alt={`u/${entry.username}`}
                      className={`w-7 h-7 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] rounded-full bg-basalt-900/90 border ${
                        entry.isPerfect
                          ? 'border-jade'
                          : 'border-brass/70'
                      }`}
                    />
                  ) : (
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold uppercase bg-basalt-900 border shadow-md ${
                        entry.isPerfect
                          ? 'border-jade text-jade'
                          : 'border-brass text-brass'
                      }`}
                    >
                      {entry.username.slice(0, 1)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right Mastery Target */}
          <span
            title="Pale Jade Mastery"
            className="z-10 text-xs font-mono text-jade pl-2 shrink-0"
          >
            ◈
          </span>
        </div>
      </footer>

      {/* Inline Overlay: How to Play OR Top Standings */}
      {overlay !== 'none' && (
        <div className="z-30 absolute inset-3 rounded-2xl bg-basalt-950/96 border border-brass/35 p-5 flex flex-col justify-between animate-reveal-rise">
          {overlay === 'rules' ? (
            <>
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <span className="text-xs font-mono tracking-[0.2em] uppercase text-brass">
                  How to Reconstruct a Sigil
                </span>
                <button
                  type="button"
                  onClick={() => setOverlay('none')}
                  className="text-xs text-stone-300 hover:text-alabaster px-2 py-0.5 rounded bg-basalt-850 border border-white/10 cursor-pointer"
                >
                  Close ✕
                </button>
              </div>

              <ul className="my-auto space-y-2.5 text-left text-xs text-stone-300 leading-relaxed">
                <li>
                  <strong className="text-alabaster">1. Rotate Strokes:</strong>{' '}
                  Tap any scattered alabaster stroke (or press{' '}
                  <span className="font-mono text-brass">R / Space</span>) to
                  rotate it by 45°.
                </li>
                <li>
                  <strong className="text-alabaster">2. Inlay Into Stone:</strong>{' '}
                  Drag each stroke into its matching carved groove on the
                  central astrolabe until it locks in Molten Brass.
                </li>
                <li>
                  <strong className="text-jade">3. Earn the Jade Seal:</strong>{' '}
                  Complete the rune within <strong>+2 moves of par</strong> to
                  ignite the altar in Pale Jade and claim top subreddit rank.
                </li>
              </ul>

              <button
                type="button"
                onClick={launchGame}
                className="w-full py-2.5 rounded-full bg-brass hover:bg-brass-bright text-basalt-950 text-xs font-extrabold tracking-[0.16em] uppercase cursor-pointer"
              >
                Enter Altar →
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <span className="text-xs font-mono tracking-[0.2em] uppercase text-brass">
                  Seal #{String(dailyPack.edition).padStart(3, '0')} · Top Scribes
                </span>
                <button
                  type="button"
                  onClick={() => setOverlay('none')}
                  className="text-xs text-stone-300 hover:text-alabaster px-2 py-0.5 rounded bg-basalt-850 border border-white/10 cursor-pointer"
                >
                  Close ✕
                </button>
              </div>

              {entries.length === 0 ? (
                <p className="my-auto text-xs text-stone-300 text-center">
                  No seals inscribed on this edition yet. Claim Rank #1!
                </p>
              ) : (
                <div className="my-auto space-y-1.5 overflow-y-auto max-h-[190px] pr-1">
                  {entries.slice(0, 5).map((row) => (
                    <div
                      key={row.username}
                      className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-basalt-900 border border-white/8 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-stone-400 w-5">
                          #{row.rank}
                        </span>
                        {row.snoovatarUrl ? (
                          <img
                            src={row.snoovatarUrl}
                            alt=""
                            className="w-5 h-5 rounded-full object-contain bg-basalt-950"
                          />
                        ) : null}
                        <span className="truncate text-alabaster">
                          u/{row.username}
                        </span>
                        {row.isPerfect && (
                          <span className="text-jade text-[10px]">◈</span>
                        )}
                      </div>
                      <span className="font-mono font-semibold text-brass">
                        {row.score} pts
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={launchGame}
                className="w-full py-2.5 rounded-full bg-brass hover:bg-brass-bright text-basalt-950 text-xs font-extrabold tracking-[0.16em] uppercase cursor-pointer"
              >
                {session?.dailyCompleted ? 'Continue Ritual →' : 'Compete Now →'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);