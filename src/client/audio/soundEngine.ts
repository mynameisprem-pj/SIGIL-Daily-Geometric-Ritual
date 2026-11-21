/**
 * Zero-asset procedural Web Audio synthesizer for Sigil.
 * Strictly initialized on user gesture; completely fault-isolated so audio
 * restrictions or unsupported WebViews never affect puzzle gameplay.
 */

// D-Pentatonic ascending frequencies (Hz): D5, E5, F#5, A5, B5, D6, E6, F#6, A6
const PENTATONIC_SNAP_HZ: readonly number[] = [
  587.33, // D5
  659.25, // E5
  739.99, // F#5
  880.0, // A5
  987.77, // B5
  1174.66, // D6
  1318.51, // E6
  1479.98, // F#6
  1760.0, // A6
];

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

class SigilSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private listeners = new Set<() => void>();

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(nextMuted: boolean): void {
    if (this.muted === nextMuted) return;
    this.muted = nextMuted;
    for (const listener of this.listeners) {
      listener();
    }
  }

  public toggleMuted(): boolean {
    const next = !this.muted;
    this.setMuted(next);
    if (!next) {
      // Audible confirmation tick when unmuting (runs inside click gesture)
      this.playRotate();
    }
    return next;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Lazily creates or resumes AudioContext ONLY when called from an interaction handler.
   */
  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;

    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }

      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {
          // Ignore autoplay/gesture rejections silently
        });
      }

      return this.ctx;
    } catch {
      return null;
    }
  }

  private pulseHaptic(durationMs: number | number[]): void {
    if (this.muted || typeof navigator === 'undefined') return;
    try {
      if (typeof navigator.vibrate === 'function') {
        navigator.vibrate(durationMs);
      }
    } catch {
      // Ignore WebViews that disallow vibrate
    }
  }

  /** Soft basalt stone pickup transient */
  public playPickup(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(142, now);
      osc.frequency.exponentialRampToValueAtTime(84, now + 0.026);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.045, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.032);
    } catch {
      // Never disrupt gameplay
    }
  }

  /** Crisp brass astrolabe 45-degree rotation detent */
  public playRotate(direction: 1 | -1 = 1): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const startHz = direction === 1 ? 660 : 600;
      const endHz = direction === 1 ? 920 : 780;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(startHz, now);
      osc.frequency.exponentialRampToValueAtTime(endHz, now + 0.024);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.048, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.034);
    } catch {
      // Never disrupt gameplay
    }
  }

  /**
   * Ascending pentatonic chime as each piece snaps into the carved groove.
   * @param lockedCount1Based 1 for first locked piece, up to totalPieces
   */
  public playSnapLock(lockedCount1Based: number): void {
    this.pulseHaptic(10);
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const idx = Math.max(
        0,
        Math.min(PENTATONIC_SNAP_HZ.length - 1, lockedCount1Based - 1)
      );
      const baseHz = PENTATONIC_SNAP_HZ[idx] ?? 587.33;
      const fifthHz = baseHz * 1.4983; // Pure musical fifth overtone

      const now = ctx.currentTime;

      // Fundamental warm bell
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(baseHz, now);

      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.linearRampToValueAtTime(0.11, now + 0.006);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      // Subtle harmonic fifth shimmer
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(fifthHz, now);

      gain2.gain.setValueAtTime(0.0001, now);
      gain2.gain.linearRampToValueAtTime(0.032, now + 0.008);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.36);
      osc2.start(now);
      osc2.stop(now + 0.24);
    } catch {
      // Never disrupt gameplay
    }
  }

  /**
   * Ceremonial Sigil Ignition chord — triggered strictly once on puzzle completion.
   * Adds a luminous high A6 jade harmonic when `isPerfect` is achieved.
   */
  public playIgnition(isPerfect: boolean): void {
    this.pulseHaptic(isPerfect ? [14, 40, 22] : 18);
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Resonant open D-major voicing: D4, A4, F#5, D6 (+ A6 crystalline shimmer if Perfect)
      const chordNotes = isPerfect
        ? [293.66, 440.0, 739.99, 1174.66, 1760.0]
        : [293.66, 440.0, 739.99, 1174.66];

      chordNotes.forEach((freq, i) => {
        const startOffset = i * 0.038;
        const t0 = now + startOffset;
        const duration = isPerfect ? 1.15 : 0.95;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = i === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, t0);

        const peakGain = i === 0 ? 0.075 : 0.055 / (1 + i * 0.22);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t0);
        osc.stop(t0 + duration + 0.04);
      });
    } catch {
      // Never disrupt gameplay
    }
  }
}

export const soundEngine = new SigilSoundEngine();