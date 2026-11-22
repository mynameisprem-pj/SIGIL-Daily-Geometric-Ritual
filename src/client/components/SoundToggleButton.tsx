import { memo } from 'react';
import { useSoundSettings } from '../hooks/useSoundSettings';

export const SoundToggleButton = memo(function SoundToggleButton() {
  const { muted, toggleMuted } = useSoundSettings();

  return (
    <button
      type="button"
      onClick={toggleMuted}
      aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
      aria-pressed={!muted}
      title={muted ? 'Unmute audio' : 'Mute audio'}
      className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#111624] hover:bg-[#1A2236] border border-white/10 text-slate-200 transition-colors cursor-pointer"
    >
      {muted ? (
        <svg
          viewBox="0 0 20 20"
          className="w-4 h-4 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9.5 4.5L5.8 7.5H3.2v5h2.6l3.7 3V4.5z" />
          <path d="M13.5 8l4 4M17.5 8l-4 4" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 20 20"
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9.5 4.5L5.8 7.5H3.2v5h2.6l3.7 3V4.5z" />
          <path d="M13.2 7.4a3.6 3.6 0 0 1 0 5.2" />
          <path d="M15.6 5.3a6.6 6.6 0 0 1 0 9.4" />
        </svg>
      )}
    </button>
  );
});