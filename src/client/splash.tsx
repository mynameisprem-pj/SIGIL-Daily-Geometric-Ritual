import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useSession } from './hooks/useSession';

export const Splash = () => {
  const { session } = useSession();

  return (
    <button
      type="button"
      onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
      className="relative flex flex-col items-center justify-between w-full h-full min-h-[320px] p-6 bg-obsidian-950 text-ivory cursor-pointer overflow-hidden select-none group border-0 text-left"
    >
      {/* Subtle radial atmosphere */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(230,184,106,0.10)_0%,transparent_68%)]" />

      {/* Top Edition Header */}
      <header className="z-10 flex items-center gap-3 text-xs tracking-[0.24em] uppercase text-stone-muted">
        <span>SIGIL #{session?.edition ?? 1}</span>
        <span className="w-1 h-1 rounded-full bg-rune-gold/60" />
        <span>DAILY RECONSTRUCTION</span>
      </header>

      {/* Center Geometric Emblem Silhouette */}
      <div className="z-10 my-4 flex items-center justify-center">
        <svg
          viewBox="0 0 160 160"
          className="w-32 h-32 text-rune-gold transition-transform duration-500 ease-out group-hover:scale-105"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle
            cx="80"
            cy="80"
            r="56"
            className="opacity-25"
            strokeDasharray="6 6"
          />
          <polygon points="80,26 128,108 32,108" className="opacity-85" />
          <line x1="80" y1="26" x2="80" y2="134" className="opacity-90" />
          <circle cx="80" cy="82" r="16" className="opacity-95" />
        </svg>
      </div>

      {/* Single Primary Action + Live Pulse */}
      <footer className="z-10 flex flex-col items-center gap-2.5">
        <span className="px-6 py-2.5 rounded-full bg-rune-gold text-obsidian-950 text-sm font-semibold tracking-wider uppercase transition-all duration-200 group-hover:bg-rune-glow">
          {session?.dailyCompleted ? 'View Today’s Sigil' : 'Reconstruct'}
        </span>
        <span className="text-xs text-stone-muted tracking-wide">
          {session ? `${session.communitySolves} reconstructed today` : 'Ready'}
        </span>
      </footer>
    </button>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);