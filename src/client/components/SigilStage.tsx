import * as React from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  ROTATION_STEP_DEG,
  SANCTUM_CENTER,
  SANCTUM_RADIUS,
  STAGE_PADDING_PX,
  STAGE_VIEWBOX_SIZE,
  TAP_MAX_DURATION_MS,
  TAP_MAX_TRAVEL_PX,
} from '../../shared/constants';
import type {
  CompiledSigilPuzzle,
  NormalizedPieceDefinition,
  PieceRuntimeState,
  Point2D,
} from '../../shared/types';
import { distanceBetween } from '../engine/geometry';
import { rotateAngleByStep } from '../engine/solver';
import type { SnapFeedbackEvent } from '../hooks/usePuzzleEngine';
import { InteractiveSigilPiece, LockedSigilPiece } from './SigilPiece';

interface SigilStageProps {
  readonly puzzle: CompiledSigilPuzzle;
  readonly pieceMap: ReadonlyMap<string, NormalizedPieceDefinition>;
  readonly states: readonly PieceRuntimeState[];
  readonly selectedPieceId: string | null;
  readonly hasInteracted: boolean;
  readonly isComplete: boolean;
  readonly lastSnapEvent: SnapFeedbackEvent | null;
  readonly onSelectPiece: (pieceId: string) => void;
  readonly onCommitDrop: (
    pieceId: string,
    newPosition: Point2D,
    didMoveMeaningfully: boolean
  ) => void;
  readonly onRotatePiece: (pieceId: string, direction?: 1 | -1) => void;
  readonly previewCanSnap: (
    pieceId: string,
    candidatePos: Point2D,
    candidateRotDeg: number
  ) => boolean;
}

interface ActiveDragSession {
  pieceId: string;
  pointerId: number;
  startSvgPoint: Point2D;
  initialPiecePos: Point2D;
  grabOffset: Point2D;
  livePosition: Point2D;
  liveRotationDeg: number;
  maxTravelPx: number;
  downTimestampMs: number;
  rafId: number | null;
}

function buildStatesByIdMap(
  states: readonly PieceRuntimeState[]
): Map<string, PieceRuntimeState> {
  const map = new Map<string, PieceRuntimeState>();
  for (const s of states) map.set(s.id, s);
  return map;
}

export function SigilStage({
  puzzle,
  pieceMap,
  states,
  selectedPieceId,
  hasInteracted,
  isComplete,
  lastSnapEvent,
  onSelectPiece,
  onCommitDrop,
  onRotatePiece,
  previewCanSnap,
}: SigilStageProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupNodesRef = useRef<Map<string, SVGGElement>>(new Map());
  const haloNodesRef = useRef<Map<string, SVGElement>>(new Map());
  const activeDragRef = useRef<ActiveDragSession | null>(null);
  const wheelThrottleRef = useRef<number>(0);

  // Latest state lookup ref so pointer/wheel/keyboard handlers stay stable across renders
  const statesByIdRef = useRef<Map<string, PieceRuntimeState>>(
    buildStatesByIdMap(states)
  );
  
  // Synchronize the lookup after React commits updated states
  useLayoutEffect(() => {
    statesByIdRef.current = buildStatesByIdMap(states);
  }, [states]);

  const lockedStates = useMemo(
    () => states.filter((s) => s.locked),
    [states]
  );

  const unlockedStates = useMemo(
    () => states.filter((s) => !s.locked),
    [states]
  );

  const hintPieceId =
    !hasInteracted && !isComplete && unlockedStates.length > 0
      ? unlockedStates[0]!.id
      : null;

  const registerGroupRef = useCallback(
    (pieceId: string, node: SVGGElement | null) => {
      if (node) groupNodesRef.current.set(pieceId, node);
      else groupNodesRef.current.delete(pieceId);
    },
    []
  );

  const registerHaloRef = useCallback(
    (pieceId: string, node: SVGCircleElement | null) => {
      if (node) haloNodesRef.current.set(pieceId, node);
      else haloNodesRef.current.delete(pieceId);
    },
    []
  );

  const clientToSvgPoint = useCallback(
    (clientX: number, clientY: number): Point2D => {
      const svg = svgRef.current;
      if (!svg) return { x: SANCTUM_CENTER, y: SANCTUM_CENTER };

      const ctm = svg.getScreenCTM();
      if (!ctm) {
        const rect = svg.getBoundingClientRect();
        const scaleX = STAGE_VIEWBOX_SIZE / Math.max(1, rect.width);
        const scaleY = STAGE_VIEWBOX_SIZE / Math.max(1, rect.height);
        return {
          x: (clientX - rect.left) * scaleX,
          y: (clientY - rect.top) * scaleY,
        };
      }

      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const transformed = pt.matrixTransform(ctm.inverse());
      return { x: transformed.x, y: transformed.y };
    },
    []
  );

  const flushDragDomTransform = useCallback(
    (drag: ActiveDragSession) => {
      drag.rafId = null;
      const gNode = groupNodesRef.current.get(drag.pieceId);
      if (gNode) {
        gNode.setAttribute(
          'transform',
          `translate(${drag.livePosition.x} ${drag.livePosition.y}) rotate(${drag.liveRotationDeg})`
        );
      }

      const haloNode = haloNodesRef.current.get(drag.pieceId);
      if (haloNode) {
        const canSnap = previewCanSnap(
          drag.pieceId,
          drag.livePosition,
          drag.liveRotationDeg
        );
        haloNode.setAttribute('opacity', canSnap ? '1' : '0');
      }
    },
    [previewCanSnap]
  );

  const clearHalo = useCallback((pieceId: string) => {
    const haloNode = haloNodesRef.current.get(pieceId);
    if (haloNode) haloNode.setAttribute('opacity', '0');
  }, []);

  // Keyboard power controls for accessibility & desktop speed
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isComplete) return;
      const targetId = activeDragRef.current?.pieceId ?? selectedPieceId;
      if (!targetId) return;

      const st = statesByIdRef.current.get(targetId);
      if (!st || st.locked) return;

      if (
        e.key === 'e' ||
        e.key === 'E' ||
        e.key === 'ArrowRight' ||
        e.key === ' ' ||
        e.key === 'r' ||
        e.key === 'R'
      ) {
        e.preventDefault();
        if (
          activeDragRef.current &&
          activeDragRef.current.pieceId === targetId
        ) {
          activeDragRef.current.liveRotationDeg = rotateAngleByStep(
            activeDragRef.current.liveRotationDeg,
            1,
            ROTATION_STEP_DEG
          );
          flushDragDomTransform(activeDragRef.current);
        }
        onRotatePiece(targetId, 1);
      } else if (e.key === 'q' || e.key === 'Q' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (
          activeDragRef.current &&
          activeDragRef.current.pieceId === targetId
        ) {
          activeDragRef.current.liveRotationDeg = rotateAngleByStep(
            activeDragRef.current.liveRotationDeg,
            -1,
            ROTATION_STEP_DEG
          );
          flushDragDomTransform(activeDragRef.current);
        }
        onRotatePiece(targetId, -1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flushDragDomTransform, isComplete, onRotatePiece, selectedPieceId]);

  // Cleanly finalize if browser window loses focus mid-drag
  useEffect(() => {
    const handleWindowBlur = () => {
      const drag = activeDragRef.current;
      if (!drag) return;
      if (drag.rafId !== null) cancelAnimationFrame(drag.rafId);
      clearHalo(drag.pieceId);
      activeDragRef.current = null;
      onCommitDrop(
        drag.pieceId,
        drag.livePosition,
        drag.maxTravelPx > TAP_MAX_TRAVEL_PX
      );
    };

    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [clearHalo, onCommitDrop]);

  const handlePiecePointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>, pieceId: string) => {
      // Ignore right/middle mouse buttons here (right-click rotates via contextmenu)
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      // Ignore secondary multi-touch pointers if another finger is already dragging
      if (activeDragRef.current !== null) return;

      const pieceState = statesByIdRef.current.get(pieceId);
      if (!pieceState || pieceState.locked || isComplete) return;

      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);

      const svgPt = clientToSvgPoint(e.clientX, e.clientY);
      activeDragRef.current = {
        pieceId,
        pointerId: e.pointerId,
        startSvgPoint: svgPt,
        initialPiecePos: pieceState.position,
        grabOffset: {
          x: pieceState.position.x - svgPt.x,
          y: pieceState.position.y - svgPt.y,
        },
        livePosition: pieceState.position,
        liveRotationDeg: pieceState.rotationDeg,
        maxTravelPx: 0,
        downTimestampMs: performance.now(),
        rafId: null,
      };

      onSelectPiece(pieceId);
    },
    [clientToSvgPoint, isComplete, onSelectPiece]
  );

  const handlePiecePointerMove = useCallback(
    (e: React.PointerEvent<SVGGElement>, pieceId: string) => {
      const drag = activeDragRef.current;
      if (!drag || drag.pieceId !== pieceId || drag.pointerId !== e.pointerId) {
        return;
      }

      const svgPt = clientToSvgPoint(e.clientX, e.clientY);
      const travel = distanceBetween(svgPt, drag.startSvgPoint);
      if (travel > drag.maxTravelPx) {
        drag.maxTravelPx = travel;
      }

      const rawX = svgPt.x + drag.grabOffset.x;
      const rawY = svgPt.y + drag.grabOffset.y;
      drag.livePosition = {
        x: Math.max(
          STAGE_PADDING_PX,
          Math.min(STAGE_VIEWBOX_SIZE - STAGE_PADDING_PX, rawX)
        ),
        y: Math.max(
          STAGE_PADDING_PX,
          Math.min(STAGE_VIEWBOX_SIZE - STAGE_PADDING_PX, rawY)
        ),
      };

      if (drag.rafId === null) {
        drag.rafId = requestAnimationFrame(() => {
          if (activeDragRef.current === drag) {
            flushDragDomTransform(drag);
          }
        });
      }
    },
    [clientToSvgPoint, flushDragDomTransform]
  );

  const finishPointerInteraction = useCallback(
    (
      e: React.PointerEvent<SVGGElement>,
      pieceId: string,
      wasCancelled: boolean
    ) => {
      const drag = activeDragRef.current;
      if (!drag || drag.pieceId !== pieceId || drag.pointerId !== e.pointerId) {
        return;
      }

      if (drag.rafId !== null) {
        cancelAnimationFrame(drag.rafId);
        drag.rafId = null;
      }

      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // Ignore if browser already released capture during cancel
        }
      }

      clearHalo(pieceId);
      activeDragRef.current = null;

      const durationMs = performance.now() - drag.downTimestampMs;
      const isQuickTap =
        !wasCancelled &&
        drag.maxTravelPx <= TAP_MAX_TRAVEL_PX &&
        durationMs <= TAP_MAX_DURATION_MS;

      if (isQuickTap) {
        // Restore exact pre-jitter position and execute crisp +45 deg clockwise rotation
        const gNode = groupNodesRef.current.get(pieceId);
        if (gNode) {
          gNode.setAttribute(
            'transform',
            `translate(${drag.initialPiecePos.x} ${drag.initialPiecePos.y}) rotate(${drag.liveRotationDeg})`
          );
        }
        onRotatePiece(pieceId, 1);
        return;
      }

      onCommitDrop(
        pieceId,
        drag.livePosition,
        drag.maxTravelPx > TAP_MAX_TRAVEL_PX
      );
    },
    [clearHalo, onCommitDrop, onRotatePiece]
  );

  const handlePiecePointerUp = useCallback(
    (e: React.PointerEvent<SVGGElement>, pieceId: string) => {
      finishPointerInteraction(e, pieceId, false);
    },
    [finishPointerInteraction]
  );

  const handlePiecePointerCancel = useCallback(
    (e: React.PointerEvent<SVGGElement>, pieceId: string) => {
      finishPointerInteraction(e, pieceId, true);
    },
    [finishPointerInteraction]
  );

  const handlePieceWheel = useCallback(
    (e: React.WheelEvent<SVGGElement>, pieceId: string) => {
      const pieceState = statesByIdRef.current.get(pieceId);
      if (!pieceState || pieceState.locked || isComplete) return;

      const now = performance.now();
      if (now - wheelThrottleRef.current < 95) return;
      wheelThrottleRef.current = now;

      const direction: 1 | -1 = e.deltaY > 0 ? 1 : -1;
      if (activeDragRef.current && activeDragRef.current.pieceId === pieceId) {
        activeDragRef.current.liveRotationDeg = rotateAngleByStep(
          activeDragRef.current.liveRotationDeg,
          direction,
          ROTATION_STEP_DEG
        );
        flushDragDomTransform(activeDragRef.current);
      }
      onRotatePiece(targetOrPieceId(pieceId), direction);
    },
    [flushDragDomTransform, isComplete, onRotatePiece]
  );

  const handlePieceContextMenu = useCallback(
    (e: React.MouseEvent<SVGGElement>, pieceId: string) => {
      e.preventDefault();
      const pieceState = statesByIdRef.current.get(pieceId);
      if (!pieceState || pieceState.locked || isComplete) return;
      onRotatePiece(pieceId, -1);
    },
    [isComplete, onRotatePiece]
  );

  return (
    <div className="relative flex items-center justify-center w-full max-w-[500px] aspect-square">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${STAGE_VIEWBOX_SIZE} ${STAGE_VIEWBOX_SIZE}`}
        className={`w-full h-full rounded-3xl bg-obsidian-900/85 border border-white/10 shadow-[0_24px_70px_rgba(0,0,0,0.65)] select-none ${
          isComplete ? 'animate-complete-ignite border-rune-gold/45' : ''
        }`}
        style={{ touchAction: 'none' }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <radialGradient id="sanctum-glow" cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor="var(--color-rune-gold)"
              stopOpacity={isComplete ? '0.18' : '0.06'}
            />
            <stop
              offset="70%"
              stopColor="var(--color-obsidian-900)"
              stopOpacity="0.02"
            />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient Sanctum Altar Geometry (strictly non-interactive) */}
        <g pointerEvents="none">
          <circle
            cx={SANCTUM_CENTER}
            cy={SANCTUM_CENTER}
            r={SANCTUM_RADIUS + 34}
            fill="url(#sanctum-glow)"
          />
          <circle
            cx={SANCTUM_CENTER}
            cy={SANCTUM_CENTER}
            r={SANCTUM_RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1.2}
          />
          <circle
            cx={SANCTUM_CENTER}
            cy={SANCTUM_CENTER}
            r={SANCTUM_RADIUS + 8}
            fill="none"
            stroke="rgba(230, 184, 106, 0.12)"
            strokeWidth={1}
            strokeDasharray="3 9"
          />

          {/* Faint Unified Stone-Etched Target Silhouette (no cut seams shown!) */}
          <path
            d={puzzle.unifiedSilhouettePathD}
            fill="none"
            stroke="rgba(243, 241, 234, 0.13)"
            strokeWidth={4.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* LAYER 1: Locked Pieces (Strictly non-interactive, sits inside stone groove) */}
        <g pointerEvents="none">
          {lockedStates.map((st) => {
            const def = pieceMap.get(st.id);
            if (!def) return null;
            return (
              <LockedSigilPiece
                key={st.id}
                definition={def}
                state={st}
                isPuzzleComplete={isComplete}
              />
            );
          })}
        </g>

        {/* Snap Lock Ripple Feedback */}
        {lastSnapEvent && (
          <g
            key={lastSnapEvent.seq}
            transform={`translate(${lastSnapEvent.position.x} ${lastSnapEvent.position.y})`}
            pointerEvents="none"
          >
            <circle
              cx={0}
              cy={0}
              r={20}
              fill="none"
              stroke="var(--color-rune-glow)"
              strokeWidth={2}
              className="animate-snap-burst"
            />
          </g>
        )}

        {/* LAYER 2: Unlocked Interactive Pieces */}
        <g>
          {unlockedStates.map((st) => {
            const def = pieceMap.get(st.id);
            if (!def) return null;
            return (
              <InteractiveSigilPiece
                key={st.id}
                definition={def}
                state={st}
                isSelected={selectedPieceId === st.id}
                showOnboardingHint={hintPieceId === st.id}
                isPuzzleComplete={isComplete}
                registerGroupRef={registerGroupRef}
                registerHaloRef={registerHaloRef}
                onPiecePointerDown={handlePiecePointerDown}
                onPiecePointerMove={handlePiecePointerMove}
                onPiecePointerUp={handlePiecePointerUp}
                onPiecePointerCancel={handlePiecePointerCancel}
                onPieceWheel={handlePieceWheel}
                onPieceContextMenu={handlePieceContextMenu}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function targetOrPieceId(pieceId: string): string {
  return pieceId;
}