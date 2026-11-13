import { Joints } from './joints';

/** Link geometry (metres) shared by the 3D model and the drag-to-move maths. */
export const BASE_H = 0.07;
export const UPPER = 0.116;
export const FORE = 0.135;
export const WRIST = 0.05;
export const HAND = 0.1; // wrist joint to the tip of the fingers
export const SHOULDER_Y = BASE_H + 0.012;

const D = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Where the fingertips are, in the arm's world (y up, x forward at pan 0). */
export function tipPosition(j: Joints): [number, number, number] {
  const [pan, lift, elbow, flex] = j;
  const a1 = lift * D;
  const a2 = a1 + (90 + elbow) * D;
  const a3 = a2 + flex * D;
  const r = UPPER * Math.sin(a1) + FORE * Math.sin(a2) + HAND * Math.sin(a3);
  const y = SHOULDER_Y + UPPER * Math.cos(a1) + FORE * Math.cos(a2) + HAND * Math.cos(a3);
  return [r * Math.cos(pan * D), y, -r * Math.sin(pan * D)];
}

/**
 * Joint angles that put the fingertips at `p`, keeping the hand pointing the same way
 * (the current hand pitch). Out-of-reach points are pulled in to the nearest reachable one.
 * Wrist spin and gripper are left alone.
 */
export function solveTip(p: [number, number, number], current: Joints): Joints {
  const pan = Math.atan2(-p[2], p[0]);
  const r = Math.hypot(p[0], p[2]);
  const a3 = (current[1] + 90 + current[2] + current[3]) * D; // hand pitch to keep
  // Wrist joint = tip minus the hand, in the arm's vertical plane (r, y).
  const wr = r - HAND * Math.sin(a3);
  const wy = p[1] - HAND * Math.cos(a3) - SHOULDER_Y;
  let d = Math.hypot(wr, wy);
  const maxD = UPPER + FORE - 1e-4;
  const minD = Math.abs(UPPER - FORE) + 1e-3;
  const dc = Math.min(Math.max(d, minD), maxD);
  const k = d > 0 ? dc / d : 1;
  d = dc;
  const cosDelta = (d * d - UPPER * UPPER - FORE * FORE) / (2 * UPPER * FORE);
  const delta = Math.acos(Math.min(1, Math.max(-1, cosDelta)));
  const alpha = Math.atan2(wr * k, wy * k);
  const beta = Math.atan2(FORE * Math.sin(delta), UPPER + FORE * Math.cos(delta));
  const a1 = alpha - beta;
  const out = [...current] as Joints;
  out[0] = pan * R2D;
  out[1] = a1 * R2D;
  out[2] = delta * R2D - 90;
  out[3] = (a3 - a1 - delta) * R2D;
  return out;
}
