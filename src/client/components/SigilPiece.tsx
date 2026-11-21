import * as React from 'react';
import { memo } from 'react';
import type {
  NormalizedPieceDefinition,
  PieceRuntimeState,
} from '../../shared/types';

interface SigilPieceProps {
  readonly definition: NormalizedPieceDefinition;
  readonly state: PieceRuntimeState;
  readonly isSelected: boolean;
  readonly showOnboardingHint: boolean;
  readonly isPuzzleComplete: boolean;
  readonly registerGroupRef?: (
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

export const LockedSigilPiece = memo(function LockedSigilPiece({
  definition,
  state,
  isPuzzleComplete,
}: {
  readonly definition: NormalizedPieceDefinition;
  readonly state: PieceRuntimeState;
  readonly isPuzzleComplete: boolean;
}) {
  const transform = `translate(${state.position.x} ${state.position.y}) rotate(${state.rotationDeg})`;

  return (
    <g transform={transform} pointerEvents="none">
      {/* Subtle warm golden under-glow once locked */}
      <path
        d={definition.localPathD}
        fill="none"
        stroke="var(--color-rune-gold)"
        strokeWidth={isPuzzleComplete ? 9 : 7}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={isPuzzleComplete ? 0.34 : 0.2}
      />
      <path
        d={definition.localPathD}
        fill="none"
        stroke={
          isPuzzleComplete
            ? 'var(--color-rune-glow)'
            : 'var(--color-rune-gold)'
        }
        strokeWidth={3.6}
        strokeLinecap="round"
        strokeLinejoin="round"
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
  registerHaloRef,
  onPiecePointerDown,
  onPiecePointerMove,
  onPiecePointerUp,
  onPiecePointerCancel,
  onPieceWheel,
  onPieceContextMenu,
}: SigilPieceProps) {
  const transform = `translate(${state.position.x} ${state.position.y}) rotate(${state.rotationDeg})`;

  return (
    <g
      ref={(node) => registerGroupRef?.(state.id, node)}
      transform={transform}
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
      {/* Contextual Sub-3-Second Onboarding Pulse (disappears on first touch) */}
      {showOnboardingHint && (
        <g pointerEvents="none" className="animate-hint-pulse">
          <circle
            cx={0}
            cy={0}
            r={24}
            fill="none"
            stroke="var(--color-rune-gold)"
            strokeWidth={1.25}
            strokeDasharray="4 4"
          />
          {/* Subtle curved rotation cue arrow around true centroid */}
          <path
            d="M 16 -18 A 24 24 0 0 1 24 2"
            fill="none"
            stroke="var(--color-rune-glow)"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <path
            d="M 20 -1 L 24 3 L 27 -2"
            fill="none"
            stroke="var(--color-rune-glow)"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}

      {/* Magnetic snap-ready halo (toggled at 60fps via DOM ref during drag) */}
      <circle
        ref={(node) => registerHaloRef?.(state.id, node)}
        cx={0}
        cy={0}
        r={22}
        fill="rgba(230, 184, 106, 0.14)"
        stroke="var(--color-rune-glow)"
        strokeWidth={1.5}
        opacity={0}
        pointerEvents="none"
      />

      {/* True centroid pivot micro-pip when selected */}
      {isSelected && (
        <circle
          cx={0}
          cy={0}
          r={2.5}
          fill="var(--color-rune-gold)"
          opacity={0.75}
          pointerEvents="none"
        />
      )}

      {/* Wide invisible hit target for effortless finger & mouse acquisition */}
      <path
        d={definition.localPathD}
        fill="none"
        stroke="transparent"
        strokeWidth={28}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="stroke"
      />

      {/* Subtle selection aura */}
      {isSelected && (
        <path
          d={definition.localPathD}
          fill="none"
          stroke="var(--color-rune-gold)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.18}
          pointerEvents="none"
        />
      )}

      {/* Crisp visible geometric stroke */}
      <path
        d={definition.localPathD}
        fill="none"
        stroke={isSelected ? 'var(--color-rune-glow)' : 'var(--color-ivory)'}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
    </g>
  );
});