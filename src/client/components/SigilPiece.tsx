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
    isPuzzleComplete && isPerfect ? '#5EEAD4' : '#EAB965';
  const coreHighlight =
    isPuzzleComplete && isPerfect ? '#CCFBF1' : '#FFF3CC';

  return (
    <g transform={transform} pointerEvents="none">
      <path
        d={definition.localPathD}
        fill="none"
        stroke={primaryMetal}
        strokeWidth={isPuzzleComplete ? 10 : 8}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={isPuzzleComplete ? 0.3 : 0.18}
      />
      <path
        d={definition.localPathD}
        fill="none"
        stroke={primaryMetal}
        strokeWidth={4}
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
        opacity={isPuzzleComplete ? 0.92 : 0.6}
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
    >
      {/* Contextual First-Move Onboarding Ring */}
      {showOnboardingHint && (
        <g pointerEvents="none" className="animate-hint-pulse">
          <circle
            cx={0}
            cy={0}
            r={26}
            fill="rgba(56, 189, 248, 0.06)"
            stroke="#38BDF8"
            strokeWidth={1.3}
            strokeDasharray="3.5 4.5"
          />
          <path
            d="M 16 -20 A 26 26 0 0 1 26 2"
            fill="none"
            stroke="#7DD3FC"
            strokeWidth={1.7}
            strokeLinecap="round"
          />
          <path
            d="M 22 -1 L 26 3 L 29 -2"
            fill="none"
            stroke="#7DD3FC"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}

      {/* Magnetic Snap-Alignment Halo */}
      <circle
        ref={(node) => registerHaloRef?.(state.id, node)}
        cx={0}
        cy={0}
        r={24}
        fill="rgba(234, 185, 101, 0.16)"
        stroke="#FFF3CC"
        strokeWidth={1.5}
        opacity={0}
        pointerEvents="none"
      />

      {/* Inner Rotator Group */}
      <g
        ref={(node) => registerRotatorRef?.(state.id, node)}
        className="piece-rotator-spring"
        style={{ transform: `rotate(${cumulativeRotRef.current}deg)` }}
      >
        {/* Invisible wide stroke for desktop hover cursor & wheel detection */}
        <path
          d={definition.localPathD}
          fill="none"
          stroke="#000000"
          strokeOpacity={0.001}
          strokeWidth={44}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="stroke"
        />

        {/* Crisp elevation shadow */}
        <path
          d={definition.localPathD}
          fill="none"
          stroke="rgba(2, 4, 10, 0.72)"
          strokeWidth={6.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />

        {/* Soft sky/amber selection glow */}
        {isSelected && (
          <path
            d={definition.localPathD}
            fill="none"
            stroke="#38BDF8"
            strokeWidth={9.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.28}
            pointerEvents="none"
          />
        )}

        {/* Crisp Ivory-White Stroke Body */}
        <path
          d={definition.localPathD}
          fill="none"
          stroke={isSelected ? '#FFF3CC' : '#F8FAFC'}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />

        {/* Specular Core Highlight */}
        <path
          d={definition.localPathD}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
          pointerEvents="none"
        />
      </g>

      {isSelected && (
        <circle
          cx={0}
          cy={0}
          r={2.5}
          fill="#38BDF8"
          opacity={0.95}
          pointerEvents="none"
        />
      )}
    </g>
  );
});