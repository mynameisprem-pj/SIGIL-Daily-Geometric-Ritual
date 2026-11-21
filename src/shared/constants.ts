export const SIGIL_EPOCH_UTC = '2026-11-21';

/** Full square SVG coordinate space (central sanctum + outer scatter ring) */
export const STAGE_VIEWBOX_SIZE = 520;
export const SANCTUM_CENTER = STAGE_VIEWBOX_SIZE / 2; // 260
export const SANCTUM_RADIUS = 136;

/** Interaction & snap tolerances */
export const ROTATION_STEP_DEG = 45;
export const SNAP_DISTANCE_PX = 20;
export const SNAP_ANGLE_TOLERANCE_DEG = 5;

/** Maximum Hausdorff point-cloud deviation (in SVG units) for visual congruence */
export const GEOMETRY_CONGRUENCE_EPSILON_PX = 1.25;
export const SAMPLE_SPACING_PX = 2.5;

/** Scatter ring bounds so initial pieces surround the sanctum cleanly */
export const SCATTER_INNER_RADIUS = 170;
export const SCATTER_OUTER_RADIUS = 204;
export const STAGE_PADDING_PX = 24;

/** Touch/mouse drag threshold distinguishing a tap-to-rotate from a drag */
export const TAP_MAX_TRAVEL_PX = 6;
export const TAP_MAX_DURATION_MS = 280;

export function getTodayUtcDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function getEditionNumber(dateKey: string): number {
  const epochMs = Date.parse(`${SIGIL_EPOCH_UTC}T00:00:00Z`);
  const targetMs = Date.parse(`${dateKey}T00:00:00Z`);
  const diffDays = Math.floor((targetMs - epochMs) / 86_400_000);
  return Math.max(1, diffDays + 1);
}

export function getDateKeyForEdition(edition: number): string {
  const clampedEdition = Math.max(1, Math.floor(edition));
  const epochMs = Date.parse(`${SIGIL_EPOCH_UTC}T00:00:00Z`);
  const targetMs = epochMs + (clampedEdition - 1) * 86_400_000;
  return new Date(targetMs).toISOString().slice(0, 10);
}

/** Day of week in UTC: 0 = Sunday, 1 = Monday, ..., 6 = Saturday */
export function getUtcDayOfWeek(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}