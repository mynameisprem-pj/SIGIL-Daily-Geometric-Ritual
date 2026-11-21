export const SIGIL_EPOCH_UTC = '2026-11-21';

export const STAGE_VIEWBOX_SIZE = 400;
export const ROTATION_STEP_DEG = 45;
export const SNAP_DISTANCE_PX = 22;

export function getTodayUtcDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function getEditionNumber(dateKey: string): number {
  const epochMs = Date.parse(`${SIGIL_EPOCH_UTC}T00:00:00Z`);
  const targetMs = Date.parse(`${dateKey}T00:00:00Z`);
  const diffDays = Math.floor((targetMs - epochMs) / 86_400_000);
  return Math.max(1, diffDays + 1);
}