import * as React from 'react';
import { memo, useRef } from 'react';
import type {
  NormalizedPieceDefinition,
  PieceRuntimeState,
} from '../../shared/types';
import { shortestSignedAngleDeltaDeg } from '../engine/geometry';

interface SigilPieceProps {
  readonly definition: NormalizedPieceDefinition;
  readonly state: PieceRuntimeState;
  readonly isSelected: boolean;
  readonly showOnboardingHint: boolean;
  readonly registerGroupRef?: (
    pieceId: string,
    node: SVGGElement | null
  ) => void;
  readonly registerRotatorRef?: (
    pieceId: string,
    node: SVGGElement | null
  ) => void;
  readonly registerHaloRef?: (
    pieceId: string,
    node: SVGCircleElement | null
  ) => void;
  readonly onPiecePointerDown?: (
    e: React.PointerEvent<SVGGElement>,
    pieceId: string
  ) => void;
  readonly onPiecePointerMove?: (
    e: React.PointerEvent<SVGGElement>,
    pieceId: string
  ) => void;
  readonly onPiecePointerUp?: (
    e: React.PointerEvent<SVGGElement>,
    pieceId: string
  ) => void;
  readonly onPiecePointerCancel?: (
    e: React.PointerEvent<SVGGElement>,
    pieceId: string
  ) => void;
  readonly onPieceWheel?: (
    e: React.WheelEvent<SVGGElement>,
    pieceId: string
  ) => void;
  readonly onPieceContextMenu?: (
    e: React.MouseEvent<SVGGElement>,
    pieceId: string
  ) => void;
}

/**
 * Locked pieces sit inlaid inside the carved stone groove.
 * Pale Jade is reserved strictly for Perfect Reconstruction; otherwise Molten Brass.
 */
export const LockedSigilPiece = memo(function LockedSigilPiece({
  definition,
  state,
  isPuzzleComplete,
  isPerfect,
}: {
  readonly definition: NormalizedPieceDefinition;
  readonly state: PieceRuntimeState;
  readonly isPuzzleComplete: boolean;
  readonly isPerfect: boolean;
}) {
  const transform = `translate(${state.position.x} ${state.position.y}) rotate(${state.rotationDeg})`;

  const primaryMetal =
    isPuzzleComplete && isPerfect
      ? 'var(--color-jade)'
      : 'var(--color-brass)';
  const coreHighlight =
    isPuzzleComplete && isPerfect
      ? 'var(--color-jade-bright)'
      : 'var(--color-brass-bright)';

  return (
    <g transform={transform} pointerEvents="none">
      {/* Soft inlaid metallic aura (lightweight stroke opacity, zero blur filter) */}
      <path
        d={definition.localPathD}
        fill="none"
        stroke={primaryMetal}
        strokeWidth={isPuzzleComplete ? 9.5 : 7.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={isPuzzleComplete ? 0.28 : 0.16}
      />
      {/* Primary inlaid metal body */}
      <path
        d={definition.localPathD}
        fill="none"
        stroke={primaryMetal}
        strokeWidth={3.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Chiseled specular ridge highlight */}
      <path
        d={definition.localPathD}
        fill="none"
        stroke={coreHighlight}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={isPuzzleComplete ? 0.9 : 0.55}
      />
    </g>
  );
});

export const InteractiveSigilPiece = memo(function InteractiveSigilPiece({
  definition,
  state,
  isSelected,
  showOnboardingHint,
  registerGroupRef,
  registerRotatorRef,
  registerHaloRef,
  onPiecePointerDown,
  onPiecePointerMove,
  onPiecePointerUp,
  onPiecePointerCancel,
  onPieceWheel,
  onPieceContextMenu,
}: SigilPieceProps) {
  // Unwrap normalized [0, 360) state angle into a continuous cumulative angle so
  // CSS 140ms rotation transitions always travel the shortest 45-degree arc (e.g. 315 -> 360).
  const cumulativeRotRef = useRef<number>(state.rotationDeg);
  const delta = shortestSignedAngleDeltaDeg(
    cumulativeRotRef.current,
    state.rotationDeg
  );
  if (Math.abs(delta) > 1e-4) {
    cumulativeRotRef.current += delta;
  }

  return (
    <g
      ref={(node) => registerGroupRef?.(state.id, node)}
      transform={`translate(${state.position.x} ${state.position.y})`}
      className="cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none', willChange: 'transform' }}
      onPointerDown={(e) => onPiecePointerDown?.(e, state.id)}
      onPointerMove={(e) => onPiecePointerMove?.(e, state.id)}
      onPointerUp={(e) => onPiecePointerUp?.(e, state.id)}
      onPointerCancel={(e) => onPiecePointerCancel?.(e, state.id)}
      onLostPointerCapture={(e) => onPiecePointerCancel?.(e, state.id)}
      onWheel={(e) => onPieceWheel?.(e, state.id)}
      onContextMenu={(e) => onPieceContextMenu?.(e, state.id)}
    >
      {/* Contextual Sub-3-Second Onboarding Cue (centered at (0,0), non-rotating) */}
      {showOnboardingHint && (
        <g pointerEvents="none" className="animate-hint-pulse">
          <circle
            cx={0}
            cy={0}
            r={25}
            fill="none"
            stroke="var(--color-brass)"
            strokeWidth={1.25}
            strokeDasharray="3.5 4.5"
          />
          <path
            d="M 16 -19 A 25 25 0 0 1 25 2"
            fill="none"
            stroke="var(--color-brass-bright)"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <path
            d="M 21 -1 L 25 3 L 28 -2"
            fill="none"
            stroke="var(--color-brass-bright)"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}

      {/* Magnetic snap-alignment halo (toggled via DOM ref at 60 FPS during drag) */}
      <circle
        ref={(node) => registerHaloRef?.(state.id, node)}
        cx={0}
        cy={0}
        r={22}
        fill="rgba(229, 184, 105, 0.13)"
        stroke="var(--color-brass-bright)"
        strokeWidth={1.4}
        opacity={0}
        pointerEvents="none"
      />

      {/* Inner Rotator Group: Smooth 140ms spring around true geometric centroid (0,0) when NOT dragging */}
      <g
        ref={(node) => registerRotatorRef?.(state.id, node)}
        className="piece-rotator-spring"
        style={{ transform: `rotate(${cumulativeRotRef.current}deg)` }}
      >
        {/* Wide 28px invisible hit stroke for effortless touch/mouse acquisition */}
        <path
          d={definition.localPathD}
          fill="none"
          stroke="transparent"
          strokeWidth={28}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="stroke"
        />

        {/* Soft basalt contact shadow beneath lifted piece */}
        <path
          d={definition.localPathD}
          fill="none"
          stroke="rgba(0, 0, 0, 0.55)"
          strokeWidth={5.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />

        {/* Brass selection aura */}
        {isSelected && (
          <path
            d={definition.localPathD}
            fill="none"
            stroke="var(--color-brass)"
            strokeWidth={8.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.2}
            pointerEvents="none"
          />
        )}

        {/* Carved Alabaster body stroke */}
        <path
          d={definition.localPathD}
          fill="none"
          stroke={
            isSelected ? 'var(--color-brass-bright)' : 'var(--color-alabaster)'
          }
          strokeWidth={3.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />

        {/* Fine inner lapidary specular highlight */}
        <path
          d={definition.localPathD}
          fill="none"
          stroke="var(--color-alabaster-core)"
          strokeWidth={1.1}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.7}
          pointerEvents="none"
        />
      </g>

      {/* True geometric centroid micro-pip when selected */}
      {isSelected && (
        <circle
          cx={0}
          cy={0}
          r={2.3}
          fill="var(--color-brass)"
          opacity={0.85}
          pointerEvents="none"
        />
      )}
    </g>
  );
});