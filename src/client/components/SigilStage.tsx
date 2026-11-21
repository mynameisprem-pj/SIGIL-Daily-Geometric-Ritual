import * as React from 'react';
import { useCallback, useLayoutEffect, useEffect, useMemo, useRef } from 'react';
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
import { distanceBetween, polarPoint } from '../engine/geometry';
import { rotateAngleByStep } from '../engine/solver';
import type {
  IgnitionPhase,
  SnapFeedbackEvent,
} from '../hooks/usePuzzleEngine';
import { InteractiveSigilPiece, LockedSigilPiece } from './SigilPiece';

interface SigilStageProps {
  readonly puzzle: CompiledSigilPuzzle;
  readonly pieceMap: ReadonlyMap<string, NormalizedPieceDefinition>;
  readonly states: readonly PieceRuntimeState[];
  readonly selectedPieceId: string | null;
  readonly hasInteracted: boolean;
  readonly isComplete: boolean;
  readonly isPerfect: boolean;
  readonly ignitionPhase: IgnitionPhase;
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

// Precomputed static 24-division astrolabe degree ticks (zero per-render allocation)
const BEZEL_TICKS = Array.from({ length: 24 }, (_, idx) => {
  const angleDeg = idx * 15;
  const isCardinal = idx % 6 === 0;
  const isOctant = idx % 3 === 0;
  const innerR = SANCTUM_RADIUS + 2;
  const outerR =
    SANCTUM_RADIUS + (isCardinal ? 12 : isOctant ? 8 : 5);
  return {
    angleDeg,
    isCardinal,
    p1: polarPoint(innerR, angleDeg),
    p2: polarPoint(outerR, angleDeg),
  };
});

export function SigilStage({
  puzzle,
  pieceMap,
  states,
  selectedPieceId,
  hasInteracted,
  isComplete,
  isPerfect,
  ignitionPhase,
  lastSnapEvent,
  onSelectPiece,
  onCommitDrop,
  onRotatePiece,
  previewCanSnap,
}: SigilStageProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupNodesRef = useRef<Map<string, SVGGElement>>(new Map());
  const rotatorNodesRef = useRef<Map<string, SVGGElement>>(new Map());
  const haloNodesRef = useRef<Map<string, SVGGElement>>(new Map());
  const activeDragRef = useRef<ActiveDragSession | null>(null);
  const wheelThrottleRef = useRef<number>(0);

  const statesByIdRef = useRef<Map<string, PieceRuntimeState>>(
    buildStatesByIdMap(states)
  );
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

  const registerRotatorRef = useCallback(
    (pieceId: string, node: SVGGElement | null) => {
      if (node) rotatorNodesRef.current.set(pieceId, node);
      else rotatorNodesRef.current.delete(pieceId);
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

  const setRotatorSpringEnabled = useCallback(
    (pieceId: string, enabled: boolean) => {
      const rotNode = rotatorNodesRef.current.get(pieceId);
      if (!rotNode) return;
      if (enabled) rotNode.classList.add('piece-rotator-spring');
      else rotNode.classList.remove('piece-rotator-spring');
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
      // Outer <g> updates ONLY translation (instantaneous 0ms lag!)
      const gNode = groupNodesRef.current.get(drag.pieceId);
      if (gNode) {
        gNode.setAttribute(
          'transform',
          `translate(${drag.livePosition.x} ${drag.livePosition.y})`
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

  useEffect(() => {
    const handleWindowBlur = () => {
      const drag = activeDragRef.current;
      if (!drag) return;
      if (drag.rafId !== null) cancelAnimationFrame(drag.rafId);
      setRotatorSpringEnabled(drag.pieceId, true);
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
  }, [clearHalo, onCommitDrop, setRotatorSpringEnabled]);

  const handlePiecePointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>, pieceId: string) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
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
        // Disable rotation spring once active dragging begins so mid-drag rotation is instant
        if (travel > TAP_MAX_TRAVEL_PX) {
          setRotatorSpringEnabled(pieceId, false);
        }
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
    [clientToSvgPoint, flushDragDomTransform, setRotatorSpringEnabled]
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
          // Ignore if browser already released capture
        }
      }

      // Restore smooth 140ms rotation spring for subsequent non-dragging taps/keys
      setRotatorSpringEnabled(pieceId, true);
      clearHalo(pieceId);
      activeDragRef.current = null;

      const durationMs = performance.now() - drag.downTimestampMs;
      const isQuickTap =
        !wasCancelled &&
        drag.maxTravelPx <= TAP_MAX_TRAVEL_PX &&
        durationMs <= TAP_MAX_DURATION_MS;

      if (isQuickTap) {
        const gNode = groupNodesRef.current.get(pieceId);
        if (gNode) {
          gNode.setAttribute(
            'transform',
            `translate(${drag.initialPiecePos.x} ${drag.initialPiecePos.y})`
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
    [clearHalo, onCommitDrop, onRotatePiece, setRotatorSpringEnabled]
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
      onRotatePiece(pieceId, direction);
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

  const completionBorderClass = isComplete
    ? isPerfect
      ? 'border-jade/50'
      : 'border-brass/50'
    : 'border-white/10';

  const ignitionAccentStroke = isPerfect
    ? 'var(--color-jade-bright)'
    : 'var(--color-brass-bright)';

  const ignitionPrimaryStroke = isPerfect
    ? 'var(--color-jade)'
    : 'var(--color-brass)';

  return (
    <div className="relative flex items-center justify-center w-full max-w-[496px] aspect-square">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${STAGE_VIEWBOX_SIZE} ${STAGE_VIEWBOX_SIZE}`}
        className={`w-full h-full rounded-[28px] bg-basalt-900 border transition-colors duration-500 shadow-[0_24px_64px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.06)] select-none ${completionBorderClass}`}
        style={{ touchAction: 'none' }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <radialGradient id="sanctum-well" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#07080c" stopOpacity="0.82" />
            <stop offset="76%" stopColor="#0c0f16" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#0e1118" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="sanctum-bloom" cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor={ignitionPrimaryStroke}
              stopOpacity={isComplete ? '0.18' : '0.04'}
            />
            <stop
              offset="72%"
              stopColor={ignitionPrimaryStroke}
              stopOpacity="0.01"
            />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* LAYER 0: Carved Basalt Astrolabe Altar (Strictly non-interactive, lightweight pure vectors) */}
        <g pointerEvents="none">
          {/* Outer tray guide ring */}
          <circle
            cx={SANCTUM_CENTER}
            cy={SANCTUM_CENTER}
            r={236}
            fill="none"
            stroke="rgba(255,255,255,0.03)"
            strokeWidth={1}
          />

          {/* sunken sanctum basin */}
          <circle
            cx={SANCTUM_CENTER}
            cy={SANCTUM_CENTER}
            r={SANCTUM_RADIUS + 20}
            fill="url(#sanctum-well)"
          />
          <circle
            cx={SANCTUM_CENTER}
            cy={SANCTUM_CENTER}
            r={SANCTUM_RADIUS + 36}
            fill="url(#sanctum-bloom)"
          />

          {/* Engraved Sanctum Bezel Rings */}
          <circle
            cx={SANCTUM_CENTER}
            cy={SANCTUM_CENTER}
            r={SANCTUM_RADIUS}
            fill="none"
            stroke={
              isComplete
                ? isPerfect
                  ? 'rgba(107, 196, 166, 0.35)'
                  : 'rgba(229, 184, 105, 0.35)'
                : 'rgba(255, 255, 255, 0.09)'
            }
            strokeWidth={1.25}
          />
          <circle
            cx={SANCTUM_CENTER}
            cy={SANCTUM_CENTER}
            r={SANCTUM_RADIUS + 14}
            fill="none"
            stroke="rgba(255, 255, 255, 0.045)"
            strokeWidth={1}
          />

          {/* 24 Astrolabe Degree Ticks */}
          {BEZEL_TICKS.map((tick) => (
            <line
              key={tick.angleDeg}
              x1={tick.p1.x}
              y1={tick.p1.y}
              x2={tick.p2.x}
              y2={tick.p2.y}
              stroke={
                tick.isCardinal
                  ? 'rgba(229, 184, 105, 0.36)'
                  : 'rgba(255, 255, 255, 0.10)'
              }
              strokeWidth={tick.isCardinal ? 1.5 : 1}
              strokeLinecap="round"
            />
          ))}

          {/* Recessed Stone-Carved Target Silhouette (Two-tone inset groove, zero cut seams) */}
          <path
            d={puzzle.unifiedSilhouettePathD}
            fill="none"
            stroke="rgba(3, 4, 7, 0.92)"
            strokeWidth={7.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={puzzle.unifiedSilhouettePathD}
            fill="none"
            stroke="rgba(244, 240, 230, 0.14)"
            strokeWidth={3.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* LAYER 1: Inlaid Locked Pieces */}
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
                isPerfect={isPerfect}
              />
            );
          })}
        </g>

        {/* LAYER 2: Controlled One-Shot Completion Ignition (Runs strictly when ignitionPhase === 'igniting') */}
        {ignitionPhase === 'igniting' && (
          <g pointerEvents="none">
            <circle
              cx={SANCTUM_CENTER}
              cy={SANCTUM_CENTER}
              r={SANCTUM_RADIUS + 6}
              fill="none"
              stroke={ignitionPrimaryStroke}
              strokeWidth={2.2}
              className="animate-ignition-shockwave"
            />
            <path
              d={puzzle.unifiedSilhouettePathD}
              pathLength={1}
              fill="none"
              stroke={ignitionAccentStroke}
              strokeWidth={5.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="0.38 1.2"
              className="animate-sheen-sweep"
            />
          </g>
        )}

        {/* Individual Piece Snap Ripple */}
        {lastSnapEvent && ignitionPhase === 'dormant' && (
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
              stroke="var(--color-brass-bright)"
              strokeWidth={1.8}
              className="animate-snap-burst"
            />
          </g>
        )}

        {/* LAYER 3: Unlocked Interactive Pieces */}
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
                registerGroupRef={registerGroupRef}
                registerRotatorRef={registerRotatorRef}
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