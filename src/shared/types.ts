export type GameMode = 'daily' | 'bonus-1' | 'bonus-2' | 'practice' | 'zen';

export interface Point2D {
  x: number;
  y: number;
}

export interface SigilStrokeSegment {
  kind: 'line' | 'arc' | 'poly';
  /** SVG path `d` string in local piece coordinates centered at (0, 0) */
  d: string;
}

export interface SigilPieceDefinition {
  id: string;
  /** Target center in the 400x400 canonical Sigil coordinate space */
  targetCenter: Point2D;
  /** Canonical target rotation (Always 0 in solved state; symmetries allowed) */
  validRotationsDeg: number[];
  segments: SigilStrokeSegment[];
}

export interface PieceRuntimeState {
  id: string;
  position: Point2D;
  rotationDeg: number;
  locked: boolean;
}

export interface SessionInitResponse {
  status: 'ok';
  postId: string;
  username: string;
  dateKey: string;
  edition: number;
  communitySolves: number;
  streak: number;
  dailyCompleted: boolean;
}

export interface ApiErrorResponse {
  status: 'error';
  message: string;
}