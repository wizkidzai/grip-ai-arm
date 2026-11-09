import { describe, expect, it } from 'vitest';
import { CHALLENGES, ChallengeProgress, nextChallenge } from './challenges';

const fresh = (): ChallengeProgress => ({ version: 1, current: null, done: [], ticks: {}, notes: {}, classes: 0 });

describe('challenge sheets', () => {
  it('every class brings a new challenge of a different kind from the last one', () => {
    let p = fresh();
    const seen: string[] = [];
    for (let k = 0; k < CHALLENGES.length; k++) {
      const c = nextChallenge(p);
      seen.push(c.id);
      p = { ...p, current: c.id, done: [...p.done, c.id] };
    }
    expect(new Set(seen).size).toBe(CHALLENGES.length); // all 20, no repeats
    const kinds = seen.map((id) => CHALLENGES.find((c) => c.id === id)!.kind);
    for (let k = 1; k < kinds.length; k++) {
      // the last few may share a kind once others run out; the early ones never do
      if (k < 12) expect(kinds[k]).not.toBe(kinds[k - 1]);
    }
  });

  it('is not only block coding: the first 6 classes cover at least 5 kinds', () => {
    let p = fresh();
    const kinds = new Set<string>();
    for (let k = 0; k < 6; k++) {
      const c = nextChallenge(p);
      kinds.add(c.kind);
      p = { ...p, current: c.id, done: [...p.done, c.id] };
    }
    expect(kinds.size).toBeGreaterThanOrEqual(5);
  });

  it('skipping a challenge (not finishing it) still gives a new one next class', () => {
    const first = nextChallenge(fresh());
    const second = nextChallenge({ ...fresh(), current: first.id });
    expect(second.id).not.toBe(first.id);
  });

  it('quiz challenges are well formed', () => {
    for (const c of CHALLENGES.filter((x) => x.quiz)) {
      expect(c.quiz!.length).toBe(c.steps.length);
      for (const q of c.quiz!) expect(q.answer).toBeLessThan(q.options.length);
    }
  });

  it('every challenge has the parts the sheet needs', () => {
    for (const c of CHALLENGES) {
      expect(c.steps.length).toBeGreaterThanOrEqual(3);
      expect(c.goal && c.bonus && c.badge && c.kind).toBeTruthy();
    }
  });
});
