import { describe, expect, it } from 'vitest';
import { simCalibration, limitsFromCalibration } from '../arm/calibration';
import { HOME, Joints } from '../arm/joints';
import { POSES } from '../arm/poses';
import { MAX_COMMANDS, Program, Stmt, compile, toPython } from './program';
import { ProgramRunner } from './runner';

const limits = limitsFromCalibration(simCalibration());
const prog = (...body: Stmt[]): Program => ({ version: 1, body });

describe('compile', () => {
  it('compiles a wave program (snapshot)', () => {
    const p = prog(
      { kind: 'speed', id: 's', speed: 'fast' },
      { kind: 'pose', id: 'p', pose: 'wave' },
      {
        kind: 'repeat',
        id: 'r',
        times: 2,
        body: [
          { kind: 'move', id: 'm1', joint: 'wrist_roll', value: 45 },
          { kind: 'move', id: 'm2', joint: 'wrist_roll', value: -45 },
        ],
      },
      { kind: 'grip', id: 'g', percent: 0 },
      { kind: 'wait', id: 'w', seconds: 1 },
    );
    const r = compile(p, limits);
    expect(r.errors).toEqual([]);
    expect(r.commands.map((c) => `${c.op}:${c.blockId}`)).toEqual([
      'speed:s',
      'move:p',
      'move:m1',
      'move:m2',
      'move:m1',
      'move:m2',
      'move:g',
      'wait:w',
    ]);
    expect(r.commands[1]).toMatchObject({ set: POSES.wave.joints });
    expect(r.commands[2]).toMatchObject({ set: [null, null, null, null, 45, null] });
  });

  it('gives kid-friendly errors attached to the right block', () => {
    const r = compile(
      prog(
        { kind: 'move', id: 'elbow', joint: 'elbow_flex', value: 500 },
        { kind: 'grip', id: 'hand', percent: 150 },
        { kind: 'wait', id: 'w', seconds: 99 },
        { kind: 'repeat', id: 'r', times: 0, body: [] },
        { kind: 'forever', id: 'f', body: [] },
        { kind: 'skill', id: 'k', task: 'unknown' },
      ),
      limits,
    );
    expect(r.commands).toEqual([]);
    expect(r.errors.map((e) => e.blockId)).toEqual(['elbow', 'hand', 'w', 'r', 'f', 'k']);
    expect(r.errors[0].message).toMatch(/Whoa, the elbow can't go to 500°/);
  });

  it('caps forever loops and huge repeats', () => {
    const forever = compile(
      prog({ kind: 'forever', id: 'f', body: [{ kind: 'turn', id: 't', joint: 'shoulder_pan', by: 10 }] }),
      limits,
    );
    expect(forever.commands).toHaveLength(MAX_COMMANDS);
    expect(forever.truncated).toBe(true);

    const nested = (depth: number): Stmt =>
      depth === 0
        ? { kind: 'wait', id: 'w', seconds: 0 }
        : { kind: 'repeat', id: `r${depth}`, times: 50, body: [nested(depth - 1)] };
    const big = compile(prog(nested(4)), limits); // 50^4 waits
    expect(big.commands.length).toBeLessThanOrEqual(MAX_COMMANDS);
  });

  it('rejects junk from imported projects', () => {
    const junk = prog(
      { kind: 'move', id: 'a', joint: 'gripper', value: 10 },
      { kind: 'move', id: 'b', joint: 'nose' as never, value: 10 },
      { kind: 'turn', id: 'c', joint: 'elbow_flex', by: NaN },
      { kind: 'pose', id: 'd', pose: 'moonwalk' as never },
      { kind: 'hack' as never, id: 'e' } as never,
    );
    expect(compile(junk, limits).errors).toHaveLength(5);
  });

  it('prints Python for the "show me the code" view', () => {
    const py = toPython(prog({ kind: 'repeat', id: 'r', times: 3, body: [{ kind: 'pose', id: 'p', pose: 'bow' }] }));
    expect(py).toContain('for _ in range(3):\n    arm.pose("bow")');
  });
});

/** Fake arm that moves instantly-ish: present jumps 50% of the way each tick. */
function simulate(runner: ProgramRunner, start: Joints, maxTicks = 5000) {
  let present = [...start] as Joints;
  const seen: Joints[] = [];
  const blocks: (string | null)[] = [];
  let t = 0;
  for (let k = 0; k < maxTicks; k++) {
    t += 33;
    const s = runner.step(present, t);
    blocks.push(s.blockId);
    if (s.done) return { seen, blocks, ticks: k, message: s.message };
    if (s.target) {
      seen.push(s.target);
      present = present.map((v, i) => v + (s.target![i] - v) * 0.5) as Joints;
    }
  }
  return { seen, blocks, ticks: maxTicks, message: 'timeout' };
}

describe('ProgramRunner', () => {
  it('runs moves in order and finishes', () => {
    const { commands } = compile(
      prog(
        { kind: 'move', id: 'a', joint: 'shoulder_pan', value: 30 },
        { kind: 'turn', id: 'b', joint: 'shoulder_pan', by: 20 },
        { kind: 'wait', id: 'c', seconds: 0.5 },
      ),
      limits,
    );
    const run = simulate(new ProgramRunner(commands, limits, () => null), [...HOME] as Joints);
    expect(run.message).toBeUndefined();
    expect(run.seen[run.seen.length - 1][0]).toBeCloseTo(50);
    const order = [...new Set(run.blocks.filter(Boolean))];
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('never targets outside the limits, even with many relative turns', () => {
    const { commands } = compile(
      prog({ kind: 'repeat', id: 'r', times: 20, body: [{ kind: 'turn', id: 't', joint: 'elbow_flex', by: 90 }] }),
      limits,
    );
    const run = simulate(new ProgramRunner(commands, limits, () => null), [...HOME] as Joints);
    for (const target of run.seen) expect(target[2]).toBeLessThanOrEqual(limits[2].max);
  });

  it('moves on when a joint cannot reach its target (e.g. gripping an object)', () => {
    const { commands } = compile(prog({ kind: 'grip', id: 'g', percent: 0 }), limits);
    const runner = new ProgramRunner(commands, limits, () => null);
    let t = 0;
    let s;
    do {
      t += 33;
      s = runner.step([0, 0, 0, 0, 0, 40] as Joints, t); // hand stuck at 40%
    } while (!s.done && t < 20_000);
    expect(s.done).toBe(true);
    expect(t).toBeLessThan(5000);
  });

  it('stops after the maximum run time', () => {
    const { commands } = compile(
      prog({ kind: 'forever', id: 'f', body: [{ kind: 'wait', id: 'w', seconds: 10 }] }),
      limits,
    );
    const runner = new ProgramRunner(commands, limits, () => null);
    runner.step([...HOME] as Joints, 0);
    const s = runner.step([...HOME] as Joints, 181_000);
    expect(s.done).toBe(true);
    expect(s.message).toMatch(/3 minutes/);
  });
});
