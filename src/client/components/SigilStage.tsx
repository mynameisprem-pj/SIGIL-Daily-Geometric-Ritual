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
  /** True when viewing inline inside the mobile feed before entering Expanded Mode */
  readonly mobileInlinePreview?: boolean;
  /** True when inside Devvit Expanded Fullscreen sheet */
  readonly isExpanded?: boolean;
  readonly onLaunchExpanded?: (e: React.MouseEvent<HTMLButtonElement>) => void;
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
  inputKind: 'touch' | 'mouse';
  identifier: number;
  startSvgPoint: Point2D;
  initialPiecePos: Point2D;
  grabOffset: Point2D;
  livePosition: Point2D;
  liveRotationDeg: number;
  maxTravelPx: number;
  downTimestampMs: number;
  isLifted: boolean;
  rafId: number | null;
}

const TOUCH_ACQUIRE_RADIUS_SVG = 48;
const MOUSE_ACQUIRE_RADIUS_SVG = 30;
const TOUCH_TAP_TOLERANCE_SVG = 16;
const TOUCH_LIFT_OFFSET_Y = -12;

function buildStatesByIdMap(
  states: readonly PieceRuntimeState[]
): Map<string, PieceRuntimeState> {
  const map = new Map<string, PieceRuntimeState>();
  for (const s of states) map.set(s.id, s);
  return map;
}

function findClosestUnlockedPieceId(
  svgPoint: Point2D,
  states: readonly PieceRuntimeState[],
  pieceMap: ReadonlyMap<string, NormalizedPieceDefinition>,
  maxRadius: number
): string | null {
  let bestId: string | null = null;
  let bestDistSq = maxRadius * maxRadius;

  for (let i = states.length - 1; i >= 0; i--) {
    const st = states[i]!;
    if (st.locked) continue;
    const def = pieceMap.get(st.id);
    if (!def) continue;

    const dxCenter = svgPoint.x - st.position.x;
    const dyCenter = svgPoint.y - st.position.y;
    const centerDistSq = dxCenter * dxCenter + dyCenter * dyCenter;
    const outerLimit = def.boundingRadius + maxRadius;
    if (centerDistSq > outerLimit * outerLimit) continue;

    const centroidEffectiveSq = Math.max(0, centerDistSq * 0.85);
    if (centroidEffectiveSq < bestDistSq && centerDistSq <= 30 * 30) {
      bestDistSq = centroidEffectiveSq;
      bestId = st.id;
    }

    const rad = (st.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const pts = def.localSamplePoints;
    for (let j = 0; j < pts.length; j++) {
      const p = pts[j]!;
      const wx = st.position.x + p.x * cos - p.y * sin;
      const wy = st.position.y + p.x * sin + p.y * cos;
      const dx = svgPoint.x - wx;
      const dy = svgPoint.y - wy;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestId = st.id;
      }
    }
  }

  return bestId;
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
  mobileInlinePreview = false,
  isExpanded = false,
  onLaunchExpanded,
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

  const latestPropsRef = useRef({
    states,
    pieceMap,
    isComplete,
    mobileInlinePreview,
    onSelectPiece,
    onCommitDrop,
    onRotatePiece,
    previewCanSnap,
  });
  useLayoutEffect(() => {
    latestPropsRef.current = {
      states,
      pieceMap,
      isComplete,
      mobileInlinePreview,
      onSelectPiece,
      onCommitDrop,
      onRotatePiece,
      previewCanSnap,
    };
  });

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
    !mobileInlinePreview &&
    !hasInteracted &&
    !isComplete &&
    unlockedStates.length > 0
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

  const flushDragDomTransform = useCallback((drag: ActiveDragSession) => {
    drag.rafId = null;
    const gNode = groupNodesRef.current.get(drag.pieceId);
    if (gNode) {
      const scaleSuffix =
        drag.inputKind === 'touch' && drag.isLifted ? ' scale(1.06)' : '';
      gNode.setAttribute(
        'transform',
        `translate(${drag.livePosition.x} ${drag.livePosition.y})${scaleSuffix}`
      );
    }

    const haloNode = haloNodesRef.current.get(drag.pieceId);
    if (haloNode) {
      const canSnap = latestPropsRef.current.previewCanSnap(
        drag.pieceId,
        drag.livePosition,
        drag.liveRotationDeg
      );
      haloNode.setAttribute('opacity', canSnap ? '1' : '0');
    }
  }, []);

  const clearHalo = useCallback((pieceId: string) => {
    const haloNode = haloNodesRef.current.get(pieceId);
    if (haloNode) haloNode.setAttribute('opacity', '0');
  }, []);

  // Dedicated Touch Engine (Active ONLY when NOT in mobileInlinePreview!)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onTouchStart = (ev: TouchEvent) => {
      const props = latestPropsRef.current;
      if (
        props.mobileInlinePreview ||
        props.isComplete ||
        activeDragRef.current !== null
      ) {
        return;
      }
      if (ev.changedTouches.length === 0) return;

      const touch = ev.changedTouches[0]!;
      const svgPt = clientToSvgPoint(touch.clientX, touch.clientY);

      const hitPieceId = findClosestUnlockedPieceId(
        svgPt,
        props.states,
        props.pieceMap,
        TOUCH_ACQUIRE_RADIUS_SVG
      );

      if (!hitPieceId) return;

      const pieceState = statesByIdRef.current.get(hitPieceId);
      if (!pieceState || pieceState.locked) return;

      if (ev.cancelable) {
        ev.preventDefault();
      }
      ev.stopPropagation();

      activeDragRef.current = {
        pieceId: hitPieceId,
        inputKind: 'touch',
        identifier: touch.identifier,
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
        isLifted: false,
        rafId: null,
      };

      props.onSelectPiece(hitPieceId);
    };

    const onTouchMove = (ev: TouchEvent) => {
      const drag = activeDragRef.current;
      if (!drag || drag.inputKind !== 'touch') return;

      let matchingTouch: Touch | null = null;
      for (let i = 0; i < ev.changedTouches.length; i++) {
        const t = ev.changedTouches[i]!;
        if (t.identifier === drag.identifier) {
          matchingTouch = t;
          break;
        }
      }
      if (!matchingTouch) return;

      if (ev.cancelable) {
        ev.preventDefault();
      }
      ev.stopPropagation();

      const svgPt = clientToSvgPoint(
        matchingTouch.clientX,
        matchingTouch.clientY
      );
      const travel = distanceBetween(svgPt, drag.startSvgPoint);

      if (travel > drag.maxTravelPx) {
        drag.maxTravelPx = travel;
      }

      if (drag.maxTravelPx <= TOUCH_TAP_TOLERANCE_SVG) {
        return;
      }

      if (!drag.isLifted) {
        drag.isLifted = true;
        setRotatorSpringEnabled(drag.pieceId, false);
      }

      const rawX = svgPt.x + drag.grabOffset.x;
      const rawY = svgPt.y + drag.grabOffset.y + TOUCH_LIFT_OFFSET_Y;
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
    };

    const finishTouch = (ev: TouchEvent, wasCancelled: boolean) => {
      const drag = activeDragRef.current;
      if (!drag || drag.inputKind !== 'touch') return;

      let matched = false;
      for (let i = 0; i < ev.changedTouches.length; i++) {
        if (ev.changedTouches[i]!.identifier === drag.identifier) {
          matched = true;
          break;
        }
      }
      if (!matched) return;

      if (ev.cancelable) {
        ev.preventDefault();
      }

      if (drag.rafId !== null) {
        cancelAnimationFrame(drag.rafId);
        drag.rafId = null;
      }

      const pieceId = drag.pieceId;
      setRotatorSpringEnabled(pieceId, true);
      clearHalo(pieceId);
      activeDragRef.current = null;

      const props = latestPropsRef.current;
      const durationMs = performance.now() - drag.downTimestampMs;
      const isQuickTap =
        !wasCancelled &&
        drag.maxTravelPx <= TOUCH_TAP_TOLERANCE_SVG &&
        durationMs <= 480;

      if (isQuickTap) {
        const gNode = groupNodesRef.current.get(pieceId);
        if (gNode) {
          gNode.setAttribute(
            'transform',
            `translate(${drag.initialPiecePos.x} ${drag.initialPiecePos.y})`
          );
        }
        props.onRotatePiece(pieceId, 1);
        return;
      }

      const gNode = groupNodesRef.current.get(pieceId);
      if (gNode) {
        gNode.setAttribute(
          'transform',
          `translate(${drag.livePosition.x} ${drag.livePosition.y})`
        );
      }

      const canSnapNow = props.previewCanSnap(
        pieceId,
        drag.livePosition,
        drag.liveRotationDeg
      );
      if (canSnapNow && typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(12);
        } catch {
          // Ignore
        }
      }

      props.onCommitDrop(
        pieceId,
        drag.livePosition,
        drag.maxTravelPx > TOUCH_TAP_TOLERANCE_SVG
      );
    };

    const onTouchEnd = (ev: TouchEvent) => finishTouch(ev, false);
    const onTouchCancel = (ev: TouchEvent) => finishTouch(ev, true);

    svg.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onTouchCancel, { passive: false });

    return () => {
      svg.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [
    clearHalo,
    clientToSvgPoint,
    flushDragDomTransform,
    setRotatorSpringEnabled,
  ]);

  // Desktop Non-Passive Wheel Rotation
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onNativeWheel = (ev: WheelEvent) => {
      const props = latestPropsRef.current;
      if (props.mobileInlinePreview || props.isComplete) return;

      const svgPt = clientToSvgPoint(ev.clientX, ev.clientY);
      const hoveredPieceId = findClosestUnlockedPieceId(
        svgPt,
        props.states,
        props.pieceMap,
        MOUSE_ACQUIRE_RADIUS_SVG
      );
      const targetPieceId =
        activeDragRef.current?.pieceId ?? hoveredPieceId;

      if (!targetPieceId) return;

      const pieceState = statesByIdRef.current.get(targetPieceId);
      if (!pieceState || pieceState.locked) return;

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
      props.onRotatePiece(targetPieceId, direction);
    };

    svg.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', onNativeWheel);
    };
  }, [clientToSvgPoint, flushDragDomTransform]);

  // Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isComplete || mobileInlinePreview) return;

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
    mobileInlinePreview,
    onCommitDrop,
    onRotatePiece,
    onSelectPiece,
    selectedPieceId,
  ]);

  const handleSvgMouseDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.pointerType === 'touch' || mobileInlinePreview) return;
      if (e.button === 2) {
        const svgPt = clientToSvgPoint(e.clientX, e.clientY);
        const hitId = findClosestUnlockedPieceId(
          svgPt,
          states,
          pieceMap,
          MOUSE_ACQUIRE_RADIUS_SVG
        );
        if (hitId && !isComplete) {
          e.preventDefault();
          onSelectPiece(hitId);
          onRotatePiece(hitId, -1);
        }
        return;
      }
      if (e.button !== 0 || activeDragRef.current !== null || isComplete) return;

      const svgPt = clientToSvgPoint(e.clientX, e.clientY);
      const hitPieceId = findClosestUnlockedPieceId(
        svgPt,
        states,
        pieceMap,
        MOUSE_ACQUIRE_RADIUS_SVG
      );
      if (!hitPieceId) return;

      const pieceState = statesByIdRef.current.get(hitPieceId);
      if (!pieceState || pieceState.locked) return;

      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }

      activeDragRef.current = {
        pieceId: hitPieceId,
        inputKind: 'mouse',
        identifier: e.pointerId,
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
        isLifted: false,
        rafId: null,
      };

      onSelectPiece(hitPieceId);
    },
    [
      clientToSvgPoint,
      isComplete,
      mobileInlinePreview,
      onRotatePiece,
      onSelectPiece,
      pieceMap,
      states,
    ]
  );

  const handleSvgMouseMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.pointerType === 'touch') return;
      const drag = activeDragRef.current;
      if (!drag || drag.inputKind !== 'mouse' || drag.identifier !== e.pointerId) {
        return;
      }

      const svgPt = clientToSvgPoint(e.clientX, e.clientY);
      const travel = distanceBetween(svgPt, drag.startSvgPoint);

      if (travel > drag.maxTravelPx) {
        drag.maxTravelPx = travel;
        if (travel > TAP_MAX_TRAVEL_PX && !drag.isLifted) {
          drag.isLifted = true;
          setRotatorSpringEnabled(drag.pieceId, false);
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

  const finishSvgMouseInteraction = useCallback(
    (e: React.PointerEvent<SVGSVGElement>, wasCancelled: boolean) => {
      if (e.pointerType === 'touch') return;
      const drag = activeDragRef.current;
      if (!drag || drag.inputKind !== 'mouse' || drag.identifier !== e.pointerId) {
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
          // Ignore
        }
      }

      const pieceId = drag.pieceId;
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

  const completionBorderClass = isComplete
    ? isPerfect
      ? 'border-teal-400/50'
      : 'border-amber-400/50'
    : 'border-white/12';

  const ignitionAccentStroke = isPerfect ? '#CCFBF1' : '#FFF3CC';
  const ignitionPrimaryStroke = isPerfect ? '#5EEAD4' : '#EAB965';

  // In Expanded Mode, lock touchAction to 'none' on stage so zero scroll gestures exist.
  // In inline feed mode, keep 'pan-y' so scrolling past the post on mobile is effortless!
  const svgTouchAction = isExpanded ? 'none' : 'pan-y';

  return (
    <div className="relative flex items-center justify-center w-full max-w-[min(452px,calc(100dvh-146px))] aspect-square mx-auto">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${STAGE_VIEWBOX_SIZE} ${STAGE_VIEWBOX_SIZE}`}
        className={`w-full h-full rounded-[28px] bg-[#0B0F1A] border transition-colors duration-500 shadow-[0_24px_64px_rgba(0,0,0,0.78),inset_0_1px_0_rgba(255,255,255,0.08)] select-none ${completionBorderClass}`}
        style={{
          touchAction: svgTouchAction,
          WebkitTapHighlightColor: 'transparent',
        }}
        onPointerDown={handleSvgMouseDown}
        onPointerMove={handleSvgMouseMove}
        onPointerUp={(e) => finishSvgMouseInteraction(e, false)}
        onPointerCancel={(e) => finishSvgMouseInteraction(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <radialGradient id="sanctum-well" cx="50%" cy="50%" r="52%">
            <stop offset="0%" stopColor="#121A2E" stopOpacity="0.92" />
            <stop offset="68%" stopColor="#0C111E" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#0B0F1A" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="sanctum-bloom" cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor={isComplete ? ignitionPrimaryStroke : '#38BDF8'}
              stopOpacity={isComplete ? '0.22' : '0.09'}
            />
            <stop
              offset="72%"
              stopColor={isComplete ? ignitionPrimaryStroke : '#38BDF8'}
              stopOpacity="0.01"
            />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* LAYER 0: Living Celestial Astrolabe Altar */}
        <g pointerEvents="none">
          <circle
            cx={SANCTUM_CENTER}
            cy={SANCTUM_CENTER}
            r={238}
            fill="none"
            stroke="rgba(255,255,255,0.035)"
            strokeWidth={1}
          />
          <circle
            cx={SANCTUM_CENTER}
            cy={SANCTUM_CENTER}
            r={SANCTUM_RADIUS + 24}
            fill="url(#sanctum-well)"
          />
          <circle
            cx={SANCTUM_CENTER}
            cy={SANCTUM_CENTER}
            r={SANCTUM_RADIUS + 40}
            fill="url(#sanctum-bloom)"
          />

          <g className="animate-bezel-drift">
            <circle
              cx={SANCTUM_CENTER}
              cy={SANCTUM_CENTER}
              r={SANCTUM_RADIUS + 15}
              fill="none"
              stroke="rgba(148, 163, 184, 0.14)"
              strokeWidth={1}
              strokeDasharray="3 9"
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
                    ? 'rgba(234, 185, 101, 0.45)'
                    : 'rgba(148, 163, 184, 0.14)'
                }
                strokeWidth={tick.isCardinal ? 1.6 : 1}
                strokeLinecap="round"
              />
            ))}
          </g>

          <circle
            cx={SANCTUM_CENTER}
            cy={SANCTUM_CENTER}
            r={SANCTUM_RADIUS}
            fill="none"
            stroke={
              isComplete
                ? isPerfect
                  ? 'rgba(94, 234, 212, 0.45)'
                  : 'rgba(234, 185, 101, 0.45)'
                : 'rgba(148, 163, 184, 0.18)'
            }
            strokeWidth={1.3}
          />

          <path
            d={puzzle.unifiedSilhouettePathD}
            fill="none"
            stroke="rgba(3, 5, 12, 0.95)"
            strokeWidth={8.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={puzzle.unifiedSilhouettePathD}
            fill="none"
            stroke="rgba(148, 163, 184, 0.24)"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {!isComplete && (
            <path
              d={puzzle.unifiedSilhouettePathD}
              fill="none"
              stroke="#7DD3FC"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-groove-breathe"
            />
          )}
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

        {/* LAYER 2: Completion Ignition */}
        {ignitionPhase === 'igniting' && (
          <g pointerEvents="none">
            <circle
              cx={SANCTUM_CENTER}
              cy={SANCTUM_CENTER}
              r={SANCTUM_RADIUS + 6}
              fill="none"
              stroke={ignitionPrimaryStroke}
              strokeWidth={2.4}
              className="animate-ignition-shockwave"
            />
            <path
              d={puzzle.unifiedSilhouettePathD}
              pathLength={1}
              fill="none"
              stroke={ignitionAccentStroke}
              strokeWidth={5.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="0.38 1.2"
              className="animate-sheen-sweep"
            />
          </g>
        )}

        {/* Snap Ripple */}
        {lastSnapEvent && ignitionPhase === 'dormant' && (
          <g
            key={lastSnapEvent.seq}
            transform={`translate(${lastSnapEvent.position.x} ${lastSnapEvent.position.y})`}
            pointerEvents="none"
          >
            <circle
              cx={0}
              cy={0}
              r={22}
              fill="none"
              stroke="#FFF3CC"
              strokeWidth={2}
              className="animate-snap-burst"
            />
          </g>
        )}

        {/* LAYER 3: Unlocked Pieces */}
        <g pointerEvents={mobileInlinePreview ? 'none' : 'auto'}>
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
              />
            );
          })}
        </g>
      </svg>

      {/* Mobile Touch In-Feed 1-Tap Launch Veil (Zero Scroll-Trapping + Guaranteed Smooth Fullscreen Dragging!) */}
      {mobileInlinePreview && onLaunchExpanded && (
        <button
          type="button"
          onClick={onLaunchExpanded}
          style={{ touchAction: 'pan-y' }}
          aria-label={`Play ${puzzle.name}`}
          className="group absolute inset-0 z-20 flex flex-col items-center justify-center rounded-[28px] bg-[#06080F]/25 active:bg-[#06080F]/40 transition-colors cursor-pointer border-0 p-4"
        >
          <span className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-white group-active:scale-95 text-slate-950 text-sm font-extrabold tracking-wide shadow-[0_12px_36px_rgba(0,0,0,0.85),0_0_28px_rgba(255,255,255,0.22)] transition-transform">
            <svg
              viewBox="0 0 16 16"
              className="w-3.5 h-3.5 fill-current"
              aria-hidden="true"
            >
              <path d="M4 2.5v11l9.5-5.5L4 2.5z" />
            </svg>
            <span>Tap to Play</span>
          </span>
          <span className="mt-2.5 px-3 py-1 rounded-full bg-[#0B0F1A]/90 border border-white/12 text-[11px] font-semibold text-slate-200 shadow-lg">
            Opens smooth touch board
          </span>
        </button>
      )}
    </div>
  );
}