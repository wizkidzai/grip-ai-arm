import { describe, expect, it } from 'vitest';
import { Joints } from './joints';
import { HARD_LIMITS, StallDetector, clampTarget, effectiveLimits, rateLimit, safeStep } from './safety';

const limits = [
  { min: -90, max: 90 },
  { min: -90, max: 90 },
  { min: -90, max: 90 },
  { min: -90, max: 90 },
  { min: -150, max: 150 },
  { min: 0, max: 100 },
];
const zero: Joints = [0, 0, 0, 0, 0, 50];

describe('clampTarget', () => {
  it('clamps to limits', () => {
    expect(clampTarget([500, -500, 10, 0, 0, 150], limits)).toEqual([90, -90, 10, 0, 0, 100]);
  });

  it('replaces NaN, Infinity and junk with the current position', () => {
    const out = clampTarget([NaN, Infinity, -Infinity, 'x' as never, undefined as never, 20], limits, zero);
    expect(out).toEqual([0, 0, 0, 0, 0, 20]);
  });

  it('never exceeds hard limits even with a crazy calibration', () => {
    const crazy = limits.map(() => ({ min: -1e9, max: 1e9 }));
    const out = clampTarget([1e9, -1e9, 1e9, -1e9, 1e9, 1e9], crazy);
    out.forEach((v, i) => {
      expect(v).toBeLessThanOrEqual(HARD_LIMITS[i].max);
      expect(v).toBeGreaterThanOrEqual(HARD_LIMITS[i].min);
    });
  });

  it('handles short arrays and swapped limits', () => {
    expect(clampTarget([], limits, zero)).toEqual(zero);
    const swapped = effectiveLimits([{ min: 50, max: -50 }]);
    expect(swapped[0]).toEqual({ min: -50, max: 50 });
  });
});

describe('rateLimit', () => {
  it('moves at most speed * dt', () => {
    const out = rateLimit(zero, [90, -90, 1, 0, 0, 50], 60, 0.1);
    expect(out[0]).toBeCloseTo(6);
    expect(out[1]).toBeCloseTo(-6);
    expect(out[2]).toBeCloseTo(1);
  });

  it('caps huge or bad dt so a frozen tab cannot cause a big jump', () => {
    expect(rateLimit(zero, [90, 0, 0, 0, 0, 50], 60, 10)[0]).toBeCloseTo(12);
    expect(rateLimit(zero, [90, 0, 0, 0, 0, 50], 60, NaN)[0]).toBe(0);
    expect(rateLimit(zero, [90, 0, 0, 0, 0, 50], 60, -1)[0]).toBe(0);
  });
});

describe('safeStep (property)', () => {
  it('always stays in limits and within one step, for random adversarial input', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const junk = [NaN, Infinity, -Infinity, 1e12, -1e12];
    let cur: Joints = [...zero];
    for (let k = 0; k < 2000; k++) {
      const target = cur.map(() => (rand() > 0.8 ? junk[Math.floor(Math.abs(rand()) * 5)] : rand() * 400));
      const next = safeStep(cur, target, limits, 90, 1 / 30);
      next.forEach((v, i) => {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeLessThanOrEqual(limits[i].max);
        expect(v).toBeGreaterThanOrEqual(limits[i].min);
        expect(Math.abs(v - cur[i])).toBeLessThanOrEqual((i === 5 ? 135 : 90) / 30 + 1e-9);
      });
      cur = next;
    }
  });
});

describe('StallDetector', () => {
  it('reports a joint that stays far from its goal', () => {
    const s = new StallDetector(20, 1000);
    const goal: Joints = [50, 0, 0, 0, 0, 0];
    expect(s.update(goal, zero, 0)).toBe(-1);
    expect(s.update(goal, zero, 900)).toBe(-1);
    expect(s.update(goal, zero, 1100)).toBe(0);
  });

  it('ignores a gripper squeezing an object', () => {
    const s = new StallDetector(20, 1000);
    expect(s.update([0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 100], 0)).toBe(-1);
    expect(s.update([0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 100], 5000)).toBe(-1);
  });
});
