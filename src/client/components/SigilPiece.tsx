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
  readonly onPieceContextMenu?: (
    e: React.MouseEvent<SVGGElement>,
    pieceId: string
  ) => void;
}

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
      <path
        d={definition.localPathD}
        fill="none"
        stroke={primaryMetal}
        strokeWidth={isPuzzleComplete ? 9.5 : 7.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={isPuzzleComplete ? 0.28 : 0.16}
      />
      <path
        d={definition.localPathD}
        fill="none"
        stroke={primaryMetal}
        strokeWidth={3.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
  onPieceContextMenu,
}: SigilPieceProps) {
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
      data-piece-id={state.id}
      ref={(node) => registerGroupRef?.(state.id, node)}
      transform={`translate(${state.position.x} ${state.position.y})`}
      className="cursor-grab active:cursor-grabbing"
      style={{ willChange: 'transform' }}
      onPointerDown={(e) => onPiecePointerDown?.(e, state.id)}
      onContextMenu={(e) => onPieceContextMenu?.(e, state.id)}
    >
      {/* Generous centroid thumb-grab cushion so curved/hooked pieces never miss mobile taps */}
      <circle
        cx={0}
        cy={0}
        r={28}
        fill="#000000"
        fillOpacity={0.001}
        pointerEvents="all"
      />

      {/* Contextual Sub-3-Second Onboarding Cue */}
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

      {/* Magnetic snap-alignment halo */}
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

      {/* Inner Rotator Group */}
      <g
        ref={(node) => registerRotatorRef?.(state.id, node)}
        className="piece-rotator-spring"
        style={{ transform: `rotate(${cumulativeRotRef.current}deg)` }}
      >
        {/* Ultra-generous 52-unit mobile touch stroke (opaque black @ 0.001 alpha fixes iOS/Android SVG hit-testing) */}
        <path
          d={definition.localPathD}
          fill="none"
          stroke="#000000"
          strokeOpacity={0.001}
          strokeWidth={52}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="stroke"
        />

        {/* Soft basalt contact shadow */}
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
            strokeWidth={8.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.24}
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
          strokeWidth={3.8}
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
          r={2.5}
          fill="var(--color-brass)"
          opacity={0.9}
          pointerEvents="none"
        />
      )}
    </g>
  );
});