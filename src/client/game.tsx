import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { STAGE_VIEWBOX_SIZE } from '../shared/constants';
import { useSession } from './hooks/useSession';

export const App = () => {
  const { session, loading } = useSession();

  return (
    <main className="relative flex flex-col items-center justify-between w-full h-screen bg-obsidian-950 text-ivory p-4 sm:p-6 overflow-hidden">
      {/* Minimal Top HUD */}
      <header className="w-full max-w-xl flex items-center justify-between text-xs tracking-[0.2em] uppercase text-stone-muted">
        <span>SIGIL #{session?.edition ?? 1}</span>
        <span>{loading ? '...' : session?.dateKey}</span>
      </header>

      {/* Dedicated Puzzle Stage Container (Phase 1 SVG Engine mounts here) */}
      <section className="relative flex items-center justify-center w-full max-w-[440px] aspect-square rounded-2xl bg-obsidian-900/80 border border-white/8 shadow-2xl">
        <svg
          viewBox={`0 0 ${STAGE_VIEWBOX_SIZE} ${STAGE_VIEWBOX_SIZE}`}
          className="w-full h-full"
        >
          <circle
            cx={STAGE_VIEWBOX_SIZE / 2}
            cy={STAGE_VIEWBOX_SIZE / 2}
            r={140}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 8"
            className="text-white/15"
          />
        </svg>
        <p className="absolute bottom-4 text-[11px] tracking-[0.18em] uppercase text-stone-muted/70">
          Stage Ready — Phase 1 Engine Next
        </p>
      </section>

      {/* Uncluttered Bottom Bar */}
      <footer className="w-full max-w-xl flex items-center justify-center text-xs text-stone-muted">
        <span>Streak: {session?.streak ?? 0}d</span>
      </footer>
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);