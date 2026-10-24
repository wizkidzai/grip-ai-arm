import { describe, expect, it } from 'vitest';
import {
  CalibrationRecorder,
  quickCalibration,
  isCalibration,
  jointsToRaw,
  limitsFromCalibration,
  rawToDeg,
  rawToJoints,
  simCalibration,
  wrapTicks,
} from './calibration';
import { Joints } from './joints';

describe('tick conversion', () => {
  it('wraps around the 0/4095 seam', () => {
    expect(wrapTicks(10, 4090)).toBe(16);
    expect(wrapTicks(4090, 10)).toBe(-16);
    expect(rawToDeg(2048 + 1024, 2048)).toBeCloseTo(90);
  });

  it('round-trips joints -> raw -> joints', () => {
    const cal = simCalibration();
    const j: Joints = [45, -30, 80, -10, 120, 40];
    const back = rawToJoints(jointsToRaw(j, cal), cal);
    back.forEach((v, i) => expect(v).toBeCloseTo(j[i], 0));
  });

  it('never wraps a goal across 0/4095 (that would send the motor the long way round)', () => {
    const cal = simCalibration();
    cal.joints[1] = { center: 228, minDeg: -100, maxDeg: 100 };
    const raw = jointsToRaw([0, -90, 0, 0, 0, 50], cal);
    expect(raw[1]).toBe(0);
  });

  it('respects an inverted gripper', () => {
    const cal = { ...simCalibration(), gripperInverted: true };
    const raw = jointsToRaw([0, 0, 0, 0, 0, 25], cal);
    expect(rawToJoints(raw, cal)[5]).toBeCloseTo(25, 0);
    expect(rawToJoints(raw, simCalibration())[5]).toBeCloseTo(75, 0);
  });
});

describe('CalibrationRecorder', () => {
  it('records centre, range and gripper direction', () => {
    const r = new CalibrationRecorder();
    r.setMiddle([2000, 2000, 2000, 2000, 2000, 2000]);
    expect(r.missingJoints()).toHaveLength(6);
    r.addSample([1000, 1000, 1000, 1000, 1000, 1500]);
    r.addSample([3000, 3000, 3000, 3000, 3000, 2600]);
    expect(r.missingJoints()).toHaveLength(0);
    const cal = r.finish(2580); // closed near the max end
    expect(cal.gripperInverted).toBe(true);
    expect(cal.joints[0].minDeg).toBeCloseTo(-87.9, 0);
    expect(cal.joints[0].maxDeg).toBeCloseTo(87.9, 0);
    expect(isCalibration(cal)).toBe(true);
    const lim = limitsFromCalibration(cal);
    expect(lim[0].min).toBeGreaterThan(cal.joints[0].minDeg);
    expect(lim[5]).toEqual({ min: 0, max: 100 });
  });

  it('rejects malformed calibrations', () => {
    expect(isCalibration(null)).toBe(false);
    expect(isCalibration({ version: 2, joints: [] })).toBe(false);
    expect(isCalibration({ ...simCalibration(), version: 1 })).toBe(false); // old, un-homed
    const bad = simCalibration();
    bad.joints[0].maxDeg = 999;
    expect(isCalibration(bad)).toBe(false);
  });
});

describe('hand direction (measured on the real SO-101 kit)', () => {
  // Leader trigger: let go = 2046, squeezed = 3278 (number goes UP when closing).
  // Follower jaw: open = 3300, closed = 1950 (number goes DOWN when closing). Opposite!
  const leader = quickCalibration({ openRaw: 2046, closedRaw: 3278 });
  const follower = quickCalibration({ openRaw: 3300, closedRaw: 1950 });
  const leaderRaw = (grip: number) => [2047, 2047, 2047, 2047, 2047, grip];

  it('squeezing the trigger closes the follower, letting go opens it', () => {
    const squeezed = rawToJoints(leaderRaw(3278), leader);
    const letGo = rawToJoints(leaderRaw(2046), leader);
    expect(squeezed[5]).toBeLessThan(3); // 0 % = closed
    expect(letGo[5]).toBeGreaterThan(97); // 100 % = open
    expect(jointsToRaw(squeezed, follower)[5]).toBeCloseTo(1950, -1);
    expect(jointsToRaw(letGo, follower)[5]).toBeCloseTo(3300, -1);
  });

  it('half squeeze = half open', () => {
    const half = rawToJoints(leaderRaw((2046 + 3278) / 2), leader);
    expect(half[5]).toBeCloseTo(50, 0);
    expect(jointsToRaw(half, follower)[5]).toBeCloseTo(2625, -1);
  });

  it('quick calibrations are valid', () => {
    expect(isCalibration(leader)).toBe(true);
    expect(isCalibration(follower)).toBe(true);
  });
});
