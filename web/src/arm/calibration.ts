import { GRIPPER, Joints, NUM_JOINTS } from './joints';
import { Limits } from './safety';

export const TICKS_PER_REV = 4096;
const DEG_PER_TICK = 360 / TICKS_PER_REV;

/** Keep the follower this many degrees away from the ends of its range. */
export const LIMIT_MARGIN_DEG = 3;

export interface JointCalibration {
  /** Raw servo reading (0-4095) in the middle pose. */
  center: number;
  /** Range of motion, in degrees relative to `center`. */
  minDeg: number;
  maxDeg: number;
}

export interface ArmCalibration {
  /** v2: the middle pose is stored in the motors (homing offset), so ranges never cross the 0/4095 wrap. */
  version: 2;
  joints: JointCalibration[];
  /** True when the gripper's closed end is at `maxDeg` instead of `minDeg`. */
  gripperInverted: boolean;
  /** True when the hand's open and closed ends were measured (so its direction is known). */
  handMeasured?: boolean;
  createdAt: string;
}

/** Signed shortest distance from `center` to `raw`, in ticks (-2048..2047). */
export function wrapTicks(raw: number, center: number): number {
  const d = (((raw - center) % TICKS_PER_REV) + TICKS_PER_REV) % TICKS_PER_REV;
  return d >= TICKS_PER_REV / 2 ? d - TICKS_PER_REV : d;
}

export function rawToDeg(raw: number, center: number): number {
  return wrapTicks(raw, center) * DEG_PER_TICK;
}

export function rawToJoints(raw: readonly number[], cal: ArmCalibration): Joints {
  const out = new Array(NUM_JOINTS) as Joints;
  for (let i = 0; i < NUM_JOINTS; i++) {
    const c = cal.joints[i];
    const deg = rawToDeg(raw[i], c.center);
    if (i === GRIPPER) {
      const span = c.maxDeg - c.minDeg || 1;
      let pct = ((deg - c.minDeg) / span) * 100;
      if (cal.gripperInverted) pct = 100 - pct;
      out[i] = Math.min(100, Math.max(0, pct));
    } else {
      out[i] = deg;
    }
  }
  return out;
}

export function jointsToRaw(joints: Joints, cal: ArmCalibration): number[] {
  return joints.map((v, i) => {
    const c = cal.joints[i];
    let deg = v;
    if (i === GRIPPER) {
      const pct = cal.gripperInverted ? 100 - v : v;
      deg = c.minDeg + (pct / 100) * (c.maxDeg - c.minDeg);
    }
    // Clamp, never wrap: a wrapped goal would send the motor the long way round.
    const raw = Math.round(c.center + deg / DEG_PER_TICK);
    return Math.min(TICKS_PER_REV - 1, Math.max(0, raw));
  });
}

/** Safe limits in joint units (degrees / %) for this calibrated arm. */
export function limitsFromCalibration(cal: ArmCalibration): Limits {
  return cal.joints.map((c, i) =>
    i === GRIPPER
      ? { min: 0, max: 100 }
      : { min: c.minDeg + LIMIT_MARGIN_DEG, max: c.maxDeg - LIMIT_MARGIN_DEG },
  );
}

/** Builds a calibration while the learner moves the arm around. */
export class CalibrationRecorder {
  centers: number[] | null = null;
  min: number[] = new Array(NUM_JOINTS).fill(0);
  max: number[] = new Array(NUM_JOINTS).fill(0);

  setMiddle(raw: readonly number[]) {
    this.centers = [...raw];
    this.min.fill(0);
    this.max.fill(0);
  }

  addSample(raw: readonly number[]) {
    if (!this.centers) return;
    for (let i = 0; i < NUM_JOINTS; i++) {
      const d = rawToDeg(raw[i], this.centers[i]);
      this.min[i] = Math.min(this.min[i], d);
      this.max[i] = Math.max(this.max[i], d);
    }
  }

  /** Joints that have not been moved far enough yet. */
  missingJoints(minSpanDeg = 20): number[] {
    const out: number[] = [];
    for (let i = 0; i < NUM_JOINTS; i++) if (this.max[i] - this.min[i] < minSpanDeg) out.push(i);
    return out;
  }

  /** `closedRaw` is the gripper reading with the hand fully closed. */
  finish(closedRaw: number): ArmCalibration {
    if (!this.centers) throw new Error('Middle pose not recorded');
    const centers = this.centers;
    const joints = centers.map((center, i) => ({ center, minDeg: this.min[i], maxDeg: this.max[i] }));
    const g = joints[GRIPPER];
    const closedDeg = rawToDeg(closedRaw, g.center);
    const gripperInverted = Math.abs(closedDeg - g.maxDeg) < Math.abs(closedDeg - g.minDeg);
    return { version: 2, joints, gripperInverted, handMeasured: true, createdAt: new Date().toISOString() };
  }
}

export function isCalibration(v: unknown): v is ArmCalibration {
  if (!v || typeof v !== 'object') return false;
  const c = v as ArmCalibration;
  return (
    c.version === 2 &&
    Array.isArray(c.joints) &&
    c.joints.length === NUM_JOINTS &&
    c.joints.every(
      (j) =>
        Number.isFinite(j.center) &&
        Number.isFinite(j.minDeg) &&
        Number.isFinite(j.maxDeg) &&
        j.minDeg <= 0 &&
        j.maxDeg >= 0 &&
        j.maxDeg - j.minDeg <= 360,
    )
  );
}

/**
 * "Quick start": for arms that were already set up (homed so their middle pose
 * reads 2047), skip the guided steps and allow the full swing of every joint.
 * Copying works the same; a full calibration gives tighter, safer limits.
 */
export function quickCalibration(hand?: { openRaw: number; closedRaw: number }): ArmCalibration {
  const joints = Array.from({ length: NUM_JOINTS }, () => ({ center: 2047, minDeg: -170, maxDeg: 170 }));
  let gripperInverted = false;
  if (hand) {
    joints[GRIPPER] = handRange(hand.openRaw, hand.closedRaw);
    // 0 % = closed, 100 % = open, whichever way this arm's hand motor turns.
    gripperInverted = hand.closedRaw > hand.openRaw;
  } else {
    joints[GRIPPER] = { center: 2047, minDeg: -90, maxDeg: 90 };
  }
  return { version: 2, joints, gripperInverted, handMeasured: !!hand, createdAt: new Date().toISOString() };
}

/** Hand range from its fully open and fully closed readings (centred between them). */
export function handRange(openRaw: number, closedRaw: number): JointCalibration {
  const center = Math.round((openRaw + closedRaw) / 2);
  const half = Math.max(5, (Math.abs(wrapTicks(openRaw, closedRaw)) / 2) * DEG_PER_TICK);
  return { center, minDeg: -half, maxDeg: half };
}

/** A plausible calibration used by the simulator. */
export function simCalibration(): ArmCalibration {
  const ranges: [number, number][] = [
    [-110, 110],
    [-100, 100],
    [-100, 95],
    [-100, 100],
    [-160, 160],
    [-10, 90],
  ];
  return {
    version: 2,
    joints: ranges.map(([minDeg, maxDeg]) => ({ center: 2048, minDeg, maxDeg })),
    gripperInverted: false,
    createdAt: new Date(0).toISOString(),
  };
}
