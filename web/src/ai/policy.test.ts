import { describe, expect, it } from 'vitest';
import { Joints } from '../arm/joints';
import { Episode, actionAt, toLeRobotRows } from './episodes';
import { Policy, Skill, buildDataset, isSavedPolicy, trainPolicy } from './policy';

/** A "wave": base swings left and right over 3 seconds. */
function waveEpisode(offset = 0): Episode {
  const frames = [];
  for (let k = 0; k <= 90; k++) {
    const t = k / 30;
    const pan = 40 * Math.sin((2 * Math.PI * t) / 3) + offset;
    const action: Joints = [pan, -20, 30, 0, 0, 50];
    const state: Joints = [pan * 0.95, -20, 30, 0, 0, 50];
    frames.push({ t, state, action });
  }
  return { id: `e${offset}`, task: 'wave', createdAt: '', frames };
}

describe('episodes', () => {
  it('looks up actions by time', () => {
    const e = waveEpisode();
    expect(actionAt(e, 0)?.[0]).toBeCloseTo(0);
    expect(actionAt(e, 0.76)?.[0]).toBeCloseTo(e.frames[22].action[0]);
    expect(actionAt(e, 99)).toBeNull();
  });

  it('exports LeRobot-style rows', () => {
    const rows = toLeRobotRows([waveEpisode(), waveEpisode(2)]);
    expect(rows).toHaveLength(182);
    expect(rows[91]).toMatchObject({ index: 91, episode_index: 1, frame_index: 0, task: 'wave' });
  });
});

describe('policy', () => {
  it('needs real data', () => {
    expect(() => buildDataset([])).toThrow();
  });

  it('learns to reproduce a demonstration (loss goes down)', async () => {
    const eps = [waveEpisode(-3), waveEpisode(0), waveEpisode(3)];
    const data = buildDataset(eps);
    const before = new Policy().evaluate(data);
    const saved = await trainPolicy(eps, { name: 'wave', task: 'wave', steps: 1500 });
    expect(saved.finalLoss).toBeLessThan(before * 0.2);
    expect(isSavedPolicy(saved)).toBe(true);

    const skill = new Skill(JSON.parse(JSON.stringify(saved)));
    const quarter = skill.act(eps[1].frames[22].state, 22 / 90);
    expect(quarter[0]).toBeGreaterThan(25); // should be near the +40° peak
    const threeQ = skill.act(eps[1].frames[67].state, 67 / 90);
    expect(threeQ[0]).toBeLessThan(-25); // near the -40° trough
  }, 30_000);

  it('rejects damaged weights', () => {
    const p = new Policy();
    const w = p.getWeights();
    w[0][0] = NaN;
    expect(() => new Policy(undefined, w)).toThrow();
  });

  it('can be stopped early', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const saved = await trainPolicy([waveEpisode()], { name: 'x', task: 'x', steps: 1000, signal: ctrl.signal });
    expect(saved.steps).toBe(0);
  });
});
