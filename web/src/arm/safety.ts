import { GRIPPER, Joints, NUM_JOINTS } from './joints';

export interface JointLimit {
  min: number;
  max: number;
}

export type Limits = JointLimit[];

/**
 * Absolute limits no calibration can exceed. Kept wide: real SO-101 joints swing up
 * to ~150° from the middle (measured), and each arm's own calibrated range is what
 * actually protects it.
 */
export const HARD_LIMITS: Limits = [
  { min: -175, max: 175 },
  { min: -175, max: 175 },
  { min: -175, max: 175 },
  { min: -175, max: 175 },
  { min: -175, max: 175 },
  { min: 0, max: 100 },
];

export const SPEEDS = {
  slow: 45,
  medium: 90,
  fast: 150,
} as const;

export type SpeedName = keyof typeof SPEEDS;

/** Gripper changes are in %/s; scale relative to the joint speed. */
const GRIPPER_SPEED_FACTOR = 1.5;

export class SafetyError extends Error {}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Intersect calibrated limits with the hard limits. */
export function effectiveLimits(limits: Limits): Limits {
  return HARD_LIMITS.map((hard, i) => {
    const l = limits[i] ?? hard;
    const min = Math.max(hard.min, Math.min(l.min, l.max));
    const max = Math.min(hard.max, Math.max(l.min, l.max));
    return min <= max ? { min, max } : { min: 0, max: 0 };
  });
}

/**
 * Validate and clamp a target. Non-finite values are replaced with the
 * current position (or the joint's centre if there is none), so a bad
 * number can never reach the motors.
 */
export function clampTarget(target: readonly number[], limits: Limits, current?: Joints): Joints {
  const lim = effectiveLimits(limits);
  const out = new Array(NUM_JOINTS) as Joints;
  for (let i = 0; i < NUM_JOINTS; i++) {
    let v = target[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      v = current?.[i] ?? (lim[i].min + lim[i].max) / 2;
    }
    out[i] = clamp(v, lim[i].min, lim[i].max);
  }
  return out;
}

/** Move at most `maxDegPerSec * dt` towards the target on every joint. */
export function rateLimit(current: Joints, target: Joints, maxDegPerSec: number, dtSec: number): Joints {
  const dt = clamp(Number.isFinite(dtSec) ? dtSec : 0, 0, 0.2);
  const out = new Array(NUM_JOINTS) as Joints;
  for (let i = 0; i < NUM_JOINTS; i++) {
    const speed = i === GRIPPER ? maxDegPerSec * GRIPPER_SPEED_FACTOR : maxDegPerSec;
    const step = speed * dt;
    out[i] = current[i] + clamp(target[i] - current[i], -step, step);
  }
  return out;
}

/** The full safety pipeline every outgoing command goes through. */
export function safeStep(
  current: Joints,
  target: readonly number[],
  limits: Limits,
  maxDegPerSec: number,
  dtSec: number,
): Joints {
  const clamped = clampTarget(target, limits, current);
  const fromCurrent = clampTarget(current, limits);
  return rateLimit(fromCurrent, clamped, maxDegPerSec, dtSec);
}

/**
 * Detects a stuck joint: the commanded position stays far from the
 * measured one for too long (e.g. the arm is blocked by the table).
 */
export class StallDetector {
  private since: number[] = new Array(NUM_JOINTS).fill(-1);

  constructor(
    private thresholdDeg = 25,
    private maxMs = 1200,
  ) {}

  /** Returns the index of a stalled joint, or -1. */
  update(goal: Joints, present: Joints, nowMs: number): number {
    for (let i = 0; i < NUM_JOINTS; i++) {
      const thresh = i === GRIPPER ? 40 : this.thresholdDeg;
      if (Math.abs(goal[i] - present[i]) > thresh) {
        if (this.since[i] < 0) this.since[i] = nowMs;
        // The gripper is allowed to squeeze an object, so it never counts.
        if (i !== GRIPPER && nowMs - this.since[i] > this.maxMs) return i;
      } else {
        this.since[i] = -1;
      }
    }
    return -1;
  }

  reset() {
    this.since.fill(-1);
  }
}
