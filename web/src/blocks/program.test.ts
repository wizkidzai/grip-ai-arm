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

describe('new blocks', () => {
  const seeded = (vals: number[]) => {
    let i = 0;
    return () => vals[i++ % vals.length];
  };

  it('compiles nod, shake, wiggle, move-many, glide, say and sound', () => {
    const r = compile(
      prog(
        { kind: 'nod', id: 'n' },
        { kind: 'shake', id: 's' },
        { kind: 'wiggle', id: 'w', times: 2 },
        { kind: 'moveMany', id: 'm', base: 10, shoulder: 20, elbow: -30 },
        { kind: 'glide', id: 'g', joint: 'elbow_flex', value: 40, seconds: 3 },
        { kind: 'say', id: 'y', text: 'Hello!' },
        { kind: 'sound', id: 'b', sound: 'cheer' },
      ),
      limits,
    );
    expect(r.errors).toEqual([]);
    expect(r.commands.map((c) => c.op)).toEqual([
      'moveBy', 'moveBy', 'moveBy', 'moveBy', // nod
      'moveBy', 'moveBy', 'moveBy', // shake
      'moveBy', 'moveBy', 'moveBy', 'moveBy', // wiggle x2
      'move', 'moveTimed', 'say', 'sound',
    ]);
    expect(r.commands[11]).toMatchObject({ set: [10, 20, -30, null, null, null] });
  });

  it('nod and shake end where they started', () => {
    const { commands } = compile(prog({ kind: 'nod', id: 'n' }, { kind: 'shake', id: 's' }), limits);
    const sum = [0, 0, 0, 0, 0, 0];
    for (const c of commands) if (c.op === 'moveBy') c.by.forEach((v, i) => (sum[i] += v));
    expect(sum).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('surprise blocks use the random source and stay inside the given range', () => {
    const r = compile(
      prog(
        { kind: 'randomMove', id: 'r', joint: 'shoulder_pan', min: -40, max: 40 },
        { kind: 'chance', id: 'c', percent: 50, body: [{ kind: 'sound', id: 'x', sound: 'boing' }] },
        { kind: 'waitRandom', id: 'w', min: 1, max: 3 },
      ),
      limits,
      [],
      seeded([0.75, 0.9, 0.5]), // random angle 20, chance fails (90 >= 50), wait 2 s
    );
    expect(r.commands[0]).toMatchObject({ op: 'move', set: [20, null, null, null, null, null] });
    expect(r.commands.map((c) => c.op)).toEqual(['move', 'wait']);
    expect(r.commands[1]).toMatchObject({ seconds: 2 });
    const yes = compile(prog({ kind: 'chance', id: 'c', percent: 50, body: [{ kind: 'nod', id: 'n' }] }), limits, [], seeded([0.1]));
    expect(yes.commands.length).toBe(4);
  });

  it('gives friendly errors for bad new blocks', () => {
    const r = compile(
      prog(
        { kind: 'moveMany', id: 'm', base: 0, shoulder: 0, elbow: 500 },
        { kind: 'glide', id: 'g', joint: 'elbow_flex', value: 10, seconds: 60 },
        { kind: 'wiggle', id: 'w', times: 99 },
        { kind: 'randomMove', id: 'r', joint: 'shoulder_pan', min: 30, max: -30 },
        { kind: 'say', id: 'y', text: '   ' },
        { kind: 'sound', id: 'b', sound: 'explosion' as never },
      ),
      limits,
    );
    expect(r.errors.map((e) => e.blockId)).toEqual(['m', 'g', 'w', 'r', 'y', 'b']);
  });

  it('glide picks a speed that arrives on time but never above the fast limit', () => {
    const { commands } = compile(prog({ kind: 'glide', id: 'g', joint: 'shoulder_pan', value: 60, seconds: 4 }), limits);
    const runner = new ProgramRunner(commands, limits, () => null);
    const s = runner.step([...HOME] as Joints, 0);
    expect(s.maxSpeed).toBeCloseTo(15, 0); // 60 deg in 4 s
    const fast = compile(prog({ kind: 'glide', id: 'g', joint: 'shoulder_pan', value: 100, seconds: 0.2 }), limits);
    expect(new ProgramRunner(fast.commands, limits, () => null).step([...HOME] as Joints, 0).maxSpeed).toBe(150);
  });

  it('say sends a speak event once and waits for the words', () => {
    const { commands } = compile(prog({ kind: 'say', id: 'y', text: 'one two three four five' }, { kind: 'nod', id: 'n' }), limits);
    const runner = new ProgramRunner(commands, limits, () => null);
    const first = runner.step([...HOME] as Joints, 0);
    expect(first.events).toEqual([{ say: 'one two three four five' }]);
    expect(first.blockId).toBe('y');
    expect(runner.step([...HOME] as Joints, 500).events).toBeUndefined();
    expect(runner.step([...HOME] as Joints, 600).blockId).toBe('y'); // still saying it
    expect(runner.step([...HOME] as Joints, 3000).blockId).toBe('n'); // then nods
  });
});
