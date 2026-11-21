export type SanctumTab = 'today' | 'ranks' | 'archive' | 'vault';

export interface CompletedSealRecord {
  readonly seed: string;
  readonly name: string;
  readonly silhouettePathD: string;
  readonly isPerfect: boolean;
  readonly bestScore: number;
}