import * as React from 'react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
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
  pointerType: string;
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

const BEZEL_TICKS = Array.from({ length: 24 }, (_, idx) => {
  const angleDeg = idx * 15;
  const isCardinal = idx % 6 === 0;
  const isOctant = idx % 3 === 0;
  const innerR = SANCTUM_RADIUS + 2;
  const outerR = SANCTUM_RADIUS + (isCardinal ? 12 : isOctant ? 8 : 5);
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
  const groupNodesRef = useRef(new Map<string, SVGGElement>());
  const rotatorNodesRef = useRef(new Map<string, SVGGElement>());
  const haloNodesRef = useRef(new Map<string, SVGCircleElement>());
  const activeDragRef = useRef<ActiveDragSession | null>(null);
  const wheelThrottleRef = useRef(0);

  const statesByIdRef = useRef(buildStatesByIdMap(states));
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

      const rect = svg.getBoundingClientRect();
      const scaleX = STAGE_VIEWBOX_SIZE / Math.max(1, rect.width);
      const scaleY = STAGE_VIEWBOX_SIZE / Math.max(1, rect.height);
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
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

  // Crucial Mobile Fix: Allow native vertical page scrolling over empty stone,
  // ONLY blocking browser scroll when actively dragging a piece!
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onTouchMove = (ev: TouchEvent) => {
      if (activeDragRef.current !== null && ev.cancelable) {
        ev.preventDefault();
      }
    };

    svg.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      svg.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  // Desktop Fix: Non-passive wheel listener stops the Reddit page from scrolling
  // whenever spinning the mouse wheel over an unlocked piece or during an active drag!
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onNativeWheel = (ev: WheelEvent) => {
      if (isComplete) return;

      const targetEl = ev.target as Element | null;
      const pieceGroup = targetEl?.closest?.('[data-piece-id]');
      const hoveredPieceId = pieceGroup?.getAttribute('data-piece-id') ?? null;
      const targetPieceId =
        activeDragRef.current?.pieceId ?? hoveredPieceId;

      if (!targetPieceId) return;

      const pieceState = statesByIdRef.current.get(targetPieceId);
      if (!pieceState || pieceState.locked) return;

      // Block the browser from scrolling the Reddit feed!
      if (ev.cancelable) {
        ev.preventDefault();
      }
      ev.stopPropagation();

      const now = performance.now();
      if (now - wheelThrottleRef.current < 90) return;
      wheelThrottleRef.current = now;

      const direction: 1 | -1 = ev.deltaY > 0 ? 1 : -1;
      if (
        activeDragRef.current &&
        activeDragRef.current.pieceId === targetPieceId
      ) {
        activeDragRef.current.liveRotationDeg = rotateAngleByStep(
          activeDragRef.current.liveRotationDeg,
          direction,
          ROTATION_STEP_DEG
        );
        flushDragDomTransform(activeDragRef.current);
      }
      onRotatePiece(targetPieceId, direction);
    };

    svg.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', onNativeWheel);
    };
  }, [flushDragDomTransform, isComplete, onRotatePiece]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isComplete) return;

      if (e.key === 'Tab' && activeDragRef.current === null) {
        const available = [...statesByIdRef.current.values()].filter(
          (s) => !s.locked
        );
        if (available.length === 0) return;
        e.preventDefault();
        const curIdx = available.findIndex((s) => s.id === selectedPieceId);
        const dir = e.shiftKey ? -1 : 1;
        const nextIdx =
          curIdx === -1
            ? 0
            : (curIdx + dir + available.length) % available.length;
        onSelectPiece(available[nextIdx]!.id);
        return;
      }

      const targetId = activeDragRef.current?.pieceId ?? selectedPieceId;
      if (!targetId) return;

      const st = statesByIdRef.current.get(targetId);
      if (!st || st.locked) return;

      if (
        activeDragRef.current === null &&
        (e.key === 'w' ||
          e.key === 'W' ||
          e.key === 's' ||
          e.key === 'S' ||
          e.key === 'a' ||
          e.key === 'A' ||
          e.key === 'd' ||
          e.key === 'D')
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 4 : 14;
        const dx =
          e.key === 'a' || e.key === 'A'
            ? -step
            : e.key === 'd' || e.key === 'D'
              ? step
              : 0;
        const dy =
          e.key === 'w' || e.key === 'W'
            ? -step
            : e.key === 's' || e.key === 'S'
              ? step
              : 0;

        onCommitDrop(
          targetId,
          { x: st.position.x + dx, y: st.position.y + dy },
          true
        );
        return;
      }

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
  }, [
    flushDragDomTransform,
    isComplete,
    onCommitDrop,
    onRotatePiece,
    onSelectPiece,
    selectedPieceId,
  ]);

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
      if (e.pointerType !== 'touch') {
        e.preventDefault();
      }

      const svg = svgRef.current;
      if (svg) {
        try {
          svg.setPointerCapture(e.pointerId);
        } catch {
          // Fallback if WebView synthetic touch lacks pointer capture
        }
      }

      const svgPt = clientToSvgPoint(e.clientX, e.clientY);
      activeDragRef.current = {
        pieceId,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
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

  const handleSvgPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const drag = activeDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) {
        return;
      }

      const tapThreshold =
        drag.pointerType === 'touch' ? 15 : TAP_MAX_TRAVEL_PX;
      const svgPt = clientToSvgPoint(e.clientX, e.clientY);
      const travel = distanceBetween(svgPt, drag.startSvgPoint);

      if (travel > drag.maxTravelPx) {
        drag.maxTravelPx = travel;
        if (travel > tapThreshold) {
          setRotatorSpringEnabled(drag.pieceId, false);
        }
      }

      if (drag.maxTravelPx <= tapThreshold && drag.pointerType === 'touch') {
        return;
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

  const finishSvgPointerInteraction = useCallback(
    (e: React.PointerEvent<SVGSVGElement>, wasCancelled: boolean) => {
      const drag = activeDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) {
        return;
      }

      if (drag.rafId !== null) {
        cancelAnimationFrame(drag.rafId);
        drag.rafId = null;
      }

      const svg = svgRef.current;
      if (svg && svg.hasPointerCapture(e.pointerId)) {
        try {
          svg.releasePointerCapture(e.pointerId);
        } catch {
          // Ignore if already released
        }
      }

      const pieceId = drag.pieceId;
      const tapThreshold =
        drag.pointerType === 'touch' ? 15 : TAP_MAX_TRAVEL_PX;
      const maxTapDuration =
        drag.pointerType === 'touch' ? 420 : TAP_MAX_DURATION_MS;

      setRotatorSpringEnabled(pieceId, true);
      clearHalo(pieceId);
      activeDragRef.current = null;

      const durationMs = performance.now() - drag.downTimestampMs;
      const isQuickTap =
        !wasCancelled &&
        drag.maxTravelPx <= tapThreshold &&
        durationMs <= maxTapDuration;

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
        drag.maxTravelPx > tapThreshold
      );
    },
    [clearHalo, onCommitDrop, onRotatePiece, setRotatorSpringEnabled]
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
    <div className="relative flex items-center justify-center w-full max-w-[min(460px,calc(100dvh-132px))] aspect-square mx-auto">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${STAGE_VIEWBOX_SIZE} ${STAGE_VIEWBOX_SIZE}`}
        className={`w-full h-full rounded-[26px] bg-basalt-900 border transition-colors duration-500 shadow-[0_20px_54px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.06)] select-none ${completionBorderClass}`}
        style={{ touchAction: 'pan-y', WebkitTapHighlightColor: 'transparent' }}
        onPointerMove={handleSvgPointerMove}
        onPointerUp={(e) => finishSvgPointerInteraction(e, false)}
        onPointerCancel={(e) => finishSvgPointerInteraction(e, true)}
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

        {/* LAYER 0: Carved Basalt Astrolabe Altar */}
        <g pointerEvents="none">
          <circle
            cx={SANCTUM_CENTER}
            cy={SANCTUM_CENTER}
            r={236}
            fill="none"
            stroke="rgba(255,255,255,0.03)"
            strokeWidth={1}
          />
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

        {/* LAYER 2: Controlled One-Shot Completion Ignition */}
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
                onPieceContextMenu={handlePieceContextMenu}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}