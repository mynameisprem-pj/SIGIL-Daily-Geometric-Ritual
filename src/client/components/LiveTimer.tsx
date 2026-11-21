
import { memo, useEffect, useState } from 'react';
import { formatDurationMs } from './timerUtils';

interface LiveTimerProps {
  readonly startedAtMs: number | null;
  readonly completedAtMs: number | null;
}

export const LiveTimer = memo(function LiveTimer({
  startedAtMs,
  completedAtMs,
}: LiveTimerProps) {
  const [nowMs, setNowMs] = useState<number>(() => performance.now());

  useEffect(() => {
    if (startedAtMs === null || completedAtMs !== null) return;

    const id = window.setInterval(() => {
      setNowMs(performance.now());
    }, 250);

    return () => window.clearInterval(id);
  }, [startedAtMs, completedAtMs]);

  const elapsed =
    startedAtMs === null
      ? 0
      : completedAtMs !== null
        ? completedAtMs - startedAtMs
        : Math.max(0, nowMs - startedAtMs);

  return (
    <span className="tabular-nums font-mono tracking-wider">
      {formatDurationMs(elapsed)}
    </span>
  );
});
