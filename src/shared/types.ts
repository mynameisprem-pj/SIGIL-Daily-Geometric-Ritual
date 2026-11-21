export type GameMode = 'daily' | 'bonus-1' | 'bonus-2' | 'practice' | 'zen';

export type DifficultyTier = 'flow' | 'ritual' | 'masterpiece' | 'ascendant';

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/**
 * Authoring primitives in canonical world coordinates (520x520 space, centered at 260,260).
 * The geometry engine normalizes these around each piece's true length-weighted centroid.
 */
export type WorldStrokePrimitive =
  | {
      readonly kind: 'line';
      readonly from: Point2D;
      readonly to: Point2D;
    }
  | {
      readonly kind: 'polyline';
      readonly points: readonly Point2D[];
      readonly closed?: boolean;
    }
  | {
      readonly kind: 'arc';
      readonly center: Point2D;
      readonly radius: number;
      /** Start angle in degrees (0 = +X East, 90 = +Y South in SVG space) */
      readonly startAngleDeg: number;
      /** Signed sweep angle in degrees (positive = clockwise in SVG space) */
      readonly sweepAngleDeg: number;
    };

export interface RawPieceBlueprint {
  readonly id: string;
  readonly primitives: readonly WorldStrokePrimitive[];
}

export interface RawSigilBlueprint {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly pieces: readonly RawPieceBlueprint[];
}

export interface NormalizedPieceDefinition {
  readonly id: string;
  /** True length-weighted geometric centroid in canonical world coordinates */
  readonly targetCentroid: Point2D;
  /** Total stroke arc-length in SVG user units */
  readonly totalLength: number;
  /** Bounding radius from local (0,0) centroid for hit-testing & scatter spacing */
  readonly boundingRadius: number;
  /** Combined SVG path `d` string in local coordinates centered at (0,0) */
  readonly localPathD: string;
  /** Combined SVG path `d` string in canonical solved world coordinates (for etched groove) */
  readonly worldPathD: string;
  /** Densely sampled visible geometry points in local coordinates centered at (0,0) */
  readonly localSamplePoints: readonly Point2D[];
  /** Densely sampled visible geometry points in canonical solved world coordinates */
  readonly worldSamplePoints: readonly Point2D[];
  /**
   * Distinct rotational self-symmetry angles in [0, 360) (e.g., [0] for asymmetric,
   * [0, 180] for 2-fold symmetric bar/lens, [0, 90, 180, 270] for 4-fold cross).
   */
  readonly selfSymmetryAnglesDeg: readonly number[];
}

export interface CompiledSigilPuzzle {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly pieces: readonly NormalizedPieceDefinition[];
  /** Combined SVG `d` of the entire Sigil in world space for the single stone-etched silhouette */
  readonly unifiedSilhouettePathD: string;
}

export interface ScheduledPuzzleEntry {
  readonly mode: GameMode;
  readonly dateKey: string;
  readonly edition: number;
  readonly seed: string;
  readonly tier: DifficultyTier;
  readonly tierLabel: string;
  readonly pieceCount: number;
  readonly puzzle: CompiledSigilPuzzle;
}

export interface DailySigilPack {
  readonly dateKey: string;
  readonly edition: number;
  readonly main: ScheduledPuzzleEntry;
  readonly bonus1: ScheduledPuzzleEntry;
  readonly bonus2: ScheduledPuzzleEntry;
}

export interface PieceRuntimeState {
  readonly id: string;
  readonly position: Point2D;
  /** Normalized angle in [0, 360) */
  readonly rotationDeg: number;
  readonly locked: boolean;
  /** Which canonical piece slot this piece locked into (supports congruent pieces) */
  readonly lockedSlotId: string | null;
  /** Minimum moves required from initial scatter state to solve this piece */
  readonly parMoves: number;
}

export interface SnapEvaluation {
  readonly matched: boolean;
  readonly targetSlotId: string | null;
  readonly snappedPosition: Point2D | null;
  readonly snappedRotationDeg: number | null;
  readonly distanceErrorPx: number;
  readonly angleErrorDeg: number;
  readonly geometryDeviationPx: number;
}

export interface PuzzleCompletionStats {
  readonly isComplete: boolean;
  readonly lockedCount: number;
  readonly totalCount: number;
  readonly moves: number;
  readonly parMoves: number;
  readonly isPerfect: boolean;
  readonly elapsedMs: number;
}

export type MasteryGrade =
  | 'grand-lapidary'
  | 'master-engraver'
  | 'adept-wayfinder'
  | 'stone-initiate';

export interface ScoreBreakdown {
  readonly totalScore: number;
  readonly baseScore: number;
  readonly moveScore: number;
  readonly speedScore: number;
  readonly perfectBonus: number;
  readonly excessMoves: number;
  readonly parTimeMs: number;
  readonly isPerfect: boolean;
  readonly grade: MasteryGrade;
  readonly gradeLabel: string;
}

/** Persisted per-seed user completion & Jade Seal record stored in Devvit Redis */
export interface PersistedSealRecord {
  readonly seed: string;
  readonly mode: GameMode;
  readonly edition: number;
  readonly name: string;
  readonly silhouettePathD: string;
  readonly isPerfect: boolean;
  readonly bestScore: number;
  readonly bestMoves: number;
  readonly bestElapsedMs: number;
  readonly completedAtIso: string;
}

export interface LeaderboardRow {
  readonly rank: number;
  readonly username: string;
  readonly score: number;
  readonly moves: number;
  readonly elapsedMs: number;
  readonly isPerfect: boolean;
}

export interface DailyLeaderboardSnapshot {
  readonly dateKey: string;
  readonly edition: number;
  readonly totalPlayers: number;
  readonly entries: readonly LeaderboardRow[];
  readonly personalRank: number | null;
  readonly percentile: number | null;
  readonly personalEntry: LeaderboardRow | null;
}

export interface CommunityPulseStats {
  readonly totalSolves: number;
  readonly perfectSolves: number;
  readonly jadeRatePercent: number;
  readonly avgMoves: number | null;
  readonly avgElapsedMs: number | null;
}

export interface SessionInitResponse {
  readonly status: 'ok';
  readonly postId: string;
  readonly username: string;
  readonly isAuthenticated: boolean;
  readonly dateKey: string;
  readonly edition: number;
  readonly communitySolves: number;
  readonly communityPulse: CommunityPulseStats;
  readonly commentSharedToday: boolean;
  readonly streak: number;
  readonly bestStreak: number;
  readonly dailyCompleted: boolean;
  readonly personalRank: number | null;
  readonly percentile: number | null;
  readonly completedRecords: readonly PersistedSealRecord[];
  readonly leaderboard: DailyLeaderboardSnapshot;
}

export interface CompletePuzzleRequest {
  readonly mode: GameMode;
  readonly dateKey: string;
  readonly edition: number;
  readonly seed: string;
  readonly sigilName: string;
  readonly silhouettePathD: string;
  readonly pieceCount: number;
  readonly moves: number;
  readonly parMoves: number;
  readonly elapsedMs: number;
}

export interface CompletePuzzleResponse {
  readonly status: 'ok';
  readonly score: ScoreBreakdown;
  readonly firstDailyAttemptRecorded: boolean;
  readonly streak: number;
  readonly bestStreak: number;
  readonly communitySolves: number;
  readonly communityPulse: CommunityPulseStats;
  readonly record: PersistedSealRecord;
  readonly leaderboard: DailyLeaderboardSnapshot;
}

export interface ShareCommentRequest {
  readonly mode: GameMode;
  readonly edition: number;
  readonly sigilName: string;
  readonly pieceCount: number;
  readonly moves: number;
  readonly parMoves: number;
  readonly elapsedMs: number;
}

export interface ShareCommentResponse {
  readonly status: 'ok';
  readonly commentId: string;
  readonly alreadyShared: boolean;
}

export interface LeaderboardApiResponse {
  readonly status: 'ok';
  readonly leaderboard: DailyLeaderboardSnapshot;
}

export interface ApiErrorResponse {
  readonly status: 'error';
  readonly message: string;
}