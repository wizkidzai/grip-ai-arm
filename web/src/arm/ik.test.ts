import { describe, expect, it } from 'vitest';
import { Joints } from './joints';
import { solveTip, tipPosition } from './ik';

describe('drag-to-move kinematics', () => {
  it('solves back to the pose it came from', () => {
    for (const j of [[10, 20, 30, -15, 0, 40], [-30, 40, -20, 10, 5, 0], [0, 0, 0, 0, 0, 30]] as Joints[]) {
      const back = solveTip(tipPosition(j), j);
      back.slice(0, 4).forEach((v, i) => expect(v).toBeCloseTo(j[i], 1));
    }
  });
  it('never returns NaN for unreachable points', () => {
    const out = solveTip([5, 5, 5], [0, 0, 0, 0, 0, 30]);
    expect(out.every(Number.isFinite)).toBe(true);
  });
});
