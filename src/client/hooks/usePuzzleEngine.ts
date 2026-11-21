import { useCallback, useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react';
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

export function usePuzzleEngine(
  puzzle: CompiledSigilPuzzle,
  seedKey: string
): UsePuzzleEngineResult {
  const pieceMap = useMemo(() => {
    const map = new Map<string, NormalizedPieceDefinition>();
    for (const p of puzzle.pieces) map.set(p.id, p);
    return map;
  }, [puzzle]);

  const currentPuzzleKey = `${seedKey}:${puzzle.id}`;

  const [states, setStates] = useState<PieceRuntimeState[]>(() =>
    createScatteredPieceStates(puzzle, currentPuzzleKey)
  );
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [moves, setMoves] = useState(0);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [completedAtMs, setCompletedAtMs] = useState<number | null>(null);
  const [ignitionPhase, setIgnitionPhase] = useState<IgnitionPhase>('dormant');
  const [lastSnapEvent, setLastSnapEvent] = useState<SnapFeedbackEvent | null>(
    null
  );

  const snapSeqRef = useRef(0);
  const prevPuzzleKeyRef = useRef(currentPuzzleKey);
  const ignitedInstanceKeyRef = useRef<string | null>(null);
  const movesRef = useRef(moves);

  // Reset puzzle state before the browser paints when the puzzle changes.
useLayoutEffect(() => {
  if (prevPuzzleKeyRef.current === currentPuzzleKey) return;

  prevPuzzleKeyRef.current = currentPuzzleKey;
  ignitedInstanceKeyRef.current = null;
  movesRef.current = 0;

  setStates(createScatteredPieceStates(puzzle, currentPuzzleKey));
  setSelectedPieceId(null);
  setHasInteracted(false);
  setMoves(0);
  setStartedAtMs(null);
  setCompletedAtMs(null);
  setIgnitionPhase('dormant');
  setLastSnapEvent(null);
}, [currentPuzzleKey, puzzle]);

  // Controlled one-way transition from 'igniting' -> 'settled' after the 1050ms sweep finishes
  useEffect(() => {
    if (ignitionPhase !== 'igniting') return;
    const timerId = window.setTimeout(() => {
      setIgnitionPhase((phase) => (phase === 'igniting' ? 'settled' : phase));
    }, 1080);
    return () => window.clearTimeout(timerId);
  }, [ignitionPhase]);

  const ensureTimerStarted = useCallback(() => {
    setHasInteracted(true);
    setStartedAtMs((prev) => prev ?? performance.now());
  }, []);

  const selectAndBringToFront = useCallback(
    (pieceId: string) => {
      setStates((prev) => {
        const target = prev.find((s) => s.id === pieceId);
        if (!target || target.locked) return prev;

        ensureTimerStarted();
        soundEngine.playPickup();
        setSelectedPieceId(pieceId);

        const idx = prev.indexOf(target);
        if (idx === prev.length - 1) return prev;
        return prev.slice(0, idx).concat(prev.slice(idx + 1), target);
      });
    },
    [ensureTimerStarted]
  );

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

      setStates((prev) => {
        const current = prev.find((s) => s.id === pieceId);
        if (!current || current.locked) return prev;

        const { position, rotationDeg, countsAsMove } =
          computeCandidate(current);
        const clampedPos = clampToStage(position);
        const normalizedRot = normalizeAngleDeg(rotationDeg);

        const nextMoves = countsAsMove
          ? movesRef.current + 1
          : movesRef.current;

        if (countsAsMove) {
          movesRef.current = nextMoves;
          ensureTimerStarted();
          setMoves(nextMoves);
        }

        const occupied = getOccupiedSlotIds(prev, pieceId);
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

        const nextStates = prev.map((s) =>
          s.id === pieceId ? updatedPiece : s
        );

        if (updatedPiece.locked) {
          const lockedNow = nextStates.filter((s) => s.locked).length;
          const allLocked = lockedNow === nextStates.length;

          snapSeqRef.current += 1;
          setLastSnapEvent({
            pieceId,
            position: updatedPiece.position,
            seq: snapSeqRef.current,
          });
          setSelectedPieceId((sel) => (sel === pieceId ? null : sel));

          // Always play ascending pentatonic lock chime for pieces 1..N-1
          if (!allLocked) {
            soundEngine.playSnapLock(lockedNow);
          }

          // Strictly ONE-SHOT puzzle completion ignition guard
          if (
            allLocked &&
            ignitedInstanceKeyRef.current !== prevPuzzleKeyRef.current
          ) {
            ignitedInstanceKeyRef.current = prevPuzzleKeyRef.current;
            const finishTs = performance.now();
            setCompletedAtMs((done) => done ?? finishTs);
            setIgnitionPhase('igniting');

            const finalStats = computeCompletionStats(
              nextStates,
              nextMoves,
              0
            );
            soundEngine.playSnapLock(lockedNow);
            soundEngine.playIgnition(finalStats.isPerfect);
          }
        } else if (interactionKind === 'rotate') {
          soundEngine.playRotate(rotateDirection);
        }

        return nextStates;
      });
    },
    [ensureTimerStarted, pieceMap, puzzle]
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

  const statesRef = useRef(states);
  useLayoutEffect(() => {
  statesRef.current = states;
}, [states]);

  const previewCanSnap = useCallback(
    (
      pieceId: string,
      candidatePos: Point2D,
      candidateRotDeg: number
    ): boolean => {
      const def = pieceMap.get(pieceId);
      if (!def) return false;
      const currentStates = statesRef.current;
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
      prevPuzzleKeyRef.current = fullSeed;
      ignitedInstanceKeyRef.current = null;
      movesRef.current = 0;
      setStates(createScatteredPieceStates(puzzle, fullSeed));
      setSelectedPieceId(null);
      setHasInteracted(false);
      setMoves(0);
      setStartedAtMs(null);
      setCompletedAtMs(null);
      setIgnitionPhase('dormant');
      setLastSnapEvent(null);
    },
    [puzzle, seedKey]
  );

  const elapsedMs =
    startedAtMs !== null && completedAtMs !== null
      ? Math.max(0, Math.round(completedAtMs - startedAtMs))
      : 0;

  const completion = useMemo(
    () => computeCompletionStats(states, moves, elapsedMs),
    [states, moves, elapsedMs]
  );

  return {
    puzzle,
    pieceMap,
    states,
    selectedPieceId,
    hasInteracted,
    moves,
    startedAtMs,
    completedAtMs,
    ignitionPhase,
    lastSnapEvent,
    completion,
    selectAndBringToFront,
    commitPieceDrop,
    rotatePiece,
    previewCanSnap,
    resetPuzzle,
  };
}