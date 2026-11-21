import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { STAGE_PADDING_PX, STAGE_VIEWBOX_SIZE } from '../../shared/constants';
import type {
  CompiledSigilPuzzle,
  NormalizedPieceDefinition,
  PieceRuntimeState,
  Point2D,
  PuzzleCompletionStats,
} from '../../shared/types';
import { soundEngine } from '../audio/soundEngine';
import { createScatteredPieceStates, normalizeAngleDeg } from '../engine/geometry';
import {
  computeCompletionStats,
  evaluatePieceSnap,
  getOccupiedSlotIds,
  rotateAngleByStep,
} from '../engine/solver';

export type IgnitionPhase = 'dormant' | 'igniting' | 'settled';

export interface SnapFeedbackEvent {
  readonly pieceId: string;
  readonly position: Point2D;
  readonly seq: number;
}

export interface UsePuzzleEngineResult {
  readonly puzzle: CompiledSigilPuzzle;
  readonly pieceMap: ReadonlyMap<string, NormalizedPieceDefinition>;
  readonly states: readonly PieceRuntimeState[];
  readonly selectedPieceId: string | null;
  readonly hasInteracted: boolean;
  readonly moves: number;
  readonly startedAtMs: number | null;
  readonly completedAtMs: number | null;
  readonly ignitionPhase: IgnitionPhase;
  readonly lastSnapEvent: SnapFeedbackEvent | null;
  readonly completion: PuzzleCompletionStats;
  selectAndBringToFront: (pieceId: string) => void;
  commitPieceDrop: (
    pieceId: string,
    newPosition: Point2D,
    didMoveMeaningfully: boolean
  ) => void;
  rotatePiece: (pieceId: string, direction?: 1 | -1) => void;
  previewCanSnap: (
    pieceId: string,
    candidatePos: Point2D,
    candidateRotDeg: number
  ) => boolean;
  resetPuzzle: (customSeedSuffix?: string) => void;
}

function clampToStage(pos: Point2D): Point2D {
  return {
    x: Math.max(
      STAGE_PADDING_PX,
      Math.min(STAGE_VIEWBOX_SIZE - STAGE_PADDING_PX, pos.x)
    ),
    y: Math.max(
      STAGE_PADDING_PX,
      Math.min(STAGE_VIEWBOX_SIZE - STAGE_PADDING_PX, pos.y)
    ),
  };
}

interface InternalPuzzleSessionState {
  readonly key: string;
  readonly states: PieceRuntimeState[];
  readonly selectedPieceId: string | null;
  readonly hasInteracted: boolean;
  readonly moves: number;
  readonly startedAtMs: number | null;
  readonly completedAtMs: number | null;
  readonly ignitionPhase: IgnitionPhase;
  readonly lastSnapEvent: SnapFeedbackEvent | null;
}

function createInitialSessionState(
  puzzle: CompiledSigilPuzzle,
  key: string
): InternalPuzzleSessionState {
  return {
    key,
    states: createScatteredPieceStates(puzzle, key),
    selectedPieceId: null,
    hasInteracted: false,
    moves: 0,
    startedAtMs: null,
    completedAtMs: null,
    ignitionPhase: 'dormant',
    lastSnapEvent: null,
  };
}

export function usePuzzleEngine(
  puzzle: CompiledSigilPuzzle,
  seedKey: string,
  onPuzzleComplete?: (stats: PuzzleCompletionStats) => void
): UsePuzzleEngineResult {
  const pieceMap = useMemo(() => {
    const map = new Map<string, NormalizedPieceDefinition>();
    for (const p of puzzle.pieces) map.set(p.id, p);
    return map;
  }, [puzzle]);

  const currentPuzzleKey = `${seedKey}:${puzzle.id}`;

  const [sessionState, setSessionState] = useState<InternalPuzzleSessionState>(
    () => createInitialSessionState(puzzle, currentPuzzleKey)
  );

  // Derived reset pattern recommended by React 19 (no ref reads during render)
  if (sessionState.key !== currentPuzzleKey) {
    setSessionState(createInitialSessionState(puzzle, currentPuzzleKey));
  }

  const snapSeqRef = useRef(0);
  const ignitedKeyRef = useRef<string | null>(null);
  const latestStatesRef = useRef<PieceRuntimeState[]>(sessionState.states);
  const onCompleteRef = useRef(onPuzzleComplete);

  useLayoutEffect(() => {
    latestStatesRef.current = sessionState.states;
    onCompleteRef.current = onPuzzleComplete;
  }, [sessionState.states, onPuzzleComplete]);

  // Controlled one-way transition from 'igniting' -> 'settled' via timer callback
  useEffect(() => {
    if (sessionState.ignitionPhase !== 'igniting') return;
    const timerId = window.setTimeout(() => {
      setSessionState((prev) =>
        prev.ignitionPhase === 'igniting'
          ? { ...prev, ignitionPhase: 'settled' }
          : prev
      );
    }, 1080);
    return () => window.clearTimeout(timerId);
  }, [sessionState.ignitionPhase]);

  const selectAndBringToFront = useCallback((pieceId: string) => {
    setSessionState((prev) => {
      const target = prev.states.find((s) => s.id === pieceId);
      if (!target || target.locked) return prev;

      soundEngine.playPickup();
      const now = prev.startedAtMs ?? performance.now();
      const idx = prev.states.indexOf(target);
      const reordered =
        idx === prev.states.length - 1
          ? prev.states
          : prev.states.slice(0, idx).concat(prev.states.slice(idx + 1), target);

      return {
        ...prev,
        hasInteracted: true,
        startedAtMs: now,
        selectedPieceId: pieceId,
        states: reordered,
      };
    });
  }, []);

  const applyPlacementOrRotation = useCallback(
    (
      pieceId: string,
      interactionKind: 'drop' | 'rotate',
      rotateDirection: 1 | -1,
      computeCandidate: (current: PieceRuntimeState) => {
        position: Point2D;
        rotationDeg: number;
        countsAsMove: boolean;
      }
    ) => {
      const def = pieceMap.get(pieceId);
      if (!def) return;

      let completedPayload: PuzzleCompletionStats | null = null;

      setSessionState((prev) => {
        const current = prev.states.find((s) => s.id === pieceId);
        if (!current || current.locked) return prev;

        const { position, rotationDeg, countsAsMove } =
          computeCandidate(current);
        const clampedPos = clampToStage(position);
        const normalizedRot = normalizeAngleDeg(rotationDeg);

        const nextStartedAt = countsAsMove
          ? (prev.startedAtMs ?? performance.now())
          : prev.startedAtMs;
        const nextMoves = countsAsMove ? prev.moves + 1 : prev.moves;

        const occupied = getOccupiedSlotIds(prev.states, pieceId);
        const snap = evaluatePieceSnap(
          def,
          clampedPos,
          normalizedRot,
          puzzle,
          occupied
        );

        const updatedPiece: PieceRuntimeState =
          snap.matched &&
          snap.snappedPosition !== null &&
          snap.snappedRotationDeg !== null
            ? {
                ...current,
                position: snap.snappedPosition,
                rotationDeg: snap.snappedRotationDeg,
                locked: true,
                lockedSlotId: snap.targetSlotId,
              }
            : {
                ...current,
                position: clampedPos,
                rotationDeg: normalizedRot,
              };

        const nextStates = prev.states.map((s) =>
          s.id === pieceId ? updatedPiece : s
        );

        let nextCompletedAt = prev.completedAtMs;
        let nextIgnitionPhase = prev.ignitionPhase;
        let nextSnapEvent = prev.lastSnapEvent;
        let nextSelectedId = prev.selectedPieceId;

        if (updatedPiece.locked) {
          const lockedNow = nextStates.filter((s) => s.locked).length;
          const allLocked = lockedNow === nextStates.length;

          snapSeqRef.current += 1;
          nextSnapEvent = {
            pieceId,
            position: updatedPiece.position,
            seq: snapSeqRef.current,
          };
          if (nextSelectedId === pieceId) {
            nextSelectedId = null;
          }

          if (!allLocked) {
            soundEngine.playSnapLock(lockedNow);
          }

          if (allLocked && ignitedKeyRef.current !== prev.key) {
            ignitedKeyRef.current = prev.key;
            const finishTs = performance.now();
            nextCompletedAt = prev.completedAtMs ?? finishTs;
            nextIgnitionPhase = 'igniting';

            const elapsed =
              nextStartedAt !== null
                ? Math.max(0, Math.round(nextCompletedAt - nextStartedAt))
                : 0;
            const finalStats = computeCompletionStats(
              nextStates,
              nextMoves,
              elapsed
            );
            completedPayload = finalStats;

            soundEngine.playSnapLock(lockedNow);
            soundEngine.playIgnition(finalStats.isPerfect);
          }
        } else if (interactionKind === 'rotate') {
          soundEngine.playRotate(rotateDirection);
        }

        return {
          ...prev,
          hasInteracted: prev.hasInteracted || countsAsMove,
          startedAtMs: nextStartedAt,
          moves: nextMoves,
          states: nextStates,
          selectedPieceId: nextSelectedId,
          completedAtMs: nextCompletedAt,
          ignitionPhase: nextIgnitionPhase,
          lastSnapEvent: nextSnapEvent,
        };
      });

      if (completedPayload !== null) {
        onCompleteRef.current?.(completedPayload);
      }
    },
    [pieceMap, puzzle]
  );

  const commitPieceDrop = useCallback(
    (pieceId: string, newPosition: Point2D, didMoveMeaningfully: boolean) => {
      applyPlacementOrRotation(pieceId, 'drop', 1, (current) => ({
        position: newPosition,
        rotationDeg: current.rotationDeg,
        countsAsMove: didMoveMeaningfully,
      }));
    },
    [applyPlacementOrRotation]
  );

  const rotatePiece = useCallback(
    (pieceId: string, direction: 1 | -1 = 1) => {
      applyPlacementOrRotation(pieceId, 'rotate', direction, (current) => ({
        position: current.position,
        rotationDeg: rotateAngleByStep(current.rotationDeg, direction),
        countsAsMove: true,
      }));
    },
    [applyPlacementOrRotation]
  );

  const previewCanSnap = useCallback(
    (
      pieceId: string,
      candidatePos: Point2D,
      candidateRotDeg: number
    ): boolean => {
      const def = pieceMap.get(pieceId);
      if (!def) return false;
      const currentStates = latestStatesRef.current;
      const target = currentStates.find((s) => s.id === pieceId);
      if (!target || target.locked) return false;
      const occupied = getOccupiedSlotIds(currentStates, pieceId);
      return evaluatePieceSnap(
        def,
        candidatePos,
        candidateRotDeg,
        puzzle,
        occupied
      ).matched;
    },
    [pieceMap, puzzle]
  );

  const resetPuzzle = useCallback(
    (customSeedSuffix = '') => {
      const fullSeed = `${seedKey}:${puzzle.id}${customSeedSuffix}`;
      ignitedKeyRef.current = null;
      setSessionState(createInitialSessionState(puzzle, fullSeed));
    },
    [puzzle, seedKey]
  );

  const elapsedMs =
    sessionState.startedAtMs !== null && sessionState.completedAtMs !== null
      ? Math.max(
          0,
          Math.round(sessionState.completedAtMs - sessionState.startedAtMs)
        )
      : 0;

  const completion = useMemo(
    () =>
      computeCompletionStats(
        sessionState.states,
        sessionState.moves,
        elapsedMs
      ),
    [sessionState.states, sessionState.moves, elapsedMs]
  );

  return {
    puzzle,
    pieceMap,
    states: sessionState.states,
    selectedPieceId: sessionState.selectedPieceId,
    hasInteracted: sessionState.hasInteracted,
    moves: sessionState.moves,
    startedAtMs: sessionState.startedAtMs,
    completedAtMs: sessionState.completedAtMs,
    ignitionPhase: sessionState.ignitionPhase,
    lastSnapEvent: sessionState.lastSnapEvent,
    completion,
    selectAndBringToFront,
    commitPieceDrop,
    rotatePiece,
    previewCanSnap,
    resetPuzzle,
  };
}