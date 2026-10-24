import { Joints, NUM_JOINTS } from '../arm/joints';
import { Episode, episodeDuration } from './episodes';

/**
 * A small behaviour-cloning policy that learns from leader/follower demos.
 *
 *   input  = follower joint state (6) + progress through the skill (1)
 *   output = where to move next (6)
 *
 * Two hidden layers of tanh units, trained with Adam on mean squared error.
 * It is deliberately tiny so it trains in seconds in the browser; recorded
 * data can be exported to train bigger LeRobot policies (e.g. ACT) on a GPU.
 */

export const IN = NUM_JOINTS + 1;
export const OUT = NUM_JOINTS;

export interface PolicyConfig {
  hidden: number;
  learningRate: number;
  batchSize: number;
  /** Std-dev of noise added to the state (in normalised units) so the policy learns to recover from small mistakes. */
  stateNoise: number;
  seed: number;
}

export const DEFAULT_CONFIG: PolicyConfig = {
  hidden: 64,
  learningRate: 3e-3,
  batchSize: 64,
  stateNoise: 0.05,
  seed: 1,
};

export interface SavedPolicy {
  version: 1;
  name: string;
  task: string;
  createdAt: string;
  config: PolicyConfig;
  /** Average demo length in seconds; the skill runs for this long. */
  duration: number;
  episodes: number;
  steps: number;
  finalLoss: number;
  norm: { mean: number[]; std: number[] };
  weights: number[][];
}

/** Small deterministic PRNG so training is reproducible. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

interface Layer {
  w: Float64Array; // out x in, row-major
  b: Float64Array;
  in: number;
  out: number;
}

export interface Dataset {
  x: Float64Array[]; // normalised inputs
  y: Float64Array[]; // normalised targets
  mean: number[];
  std: number[];
  duration: number;
}

/** Joint state and action share the same normalisation (same units). */
export function buildDataset(episodes: Episode[]): Dataset {
  const usable = episodes.filter((e) => e.frames.length >= 10);
  if (!usable.length) throw new Error('Record at least one longer demonstration first.');
  const all = usable.flatMap((e) => e.frames.flatMap((f) => [f.state, f.action]));
  const mean: number[] = [];
  const std: number[] = [];
  for (let j = 0; j < NUM_JOINTS; j++) {
    const m = all.reduce((s, v) => s + v[j], 0) / all.length;
    const sd = Math.sqrt(all.reduce((s, v) => s + (v[j] - m) ** 2, 0) / all.length);
    mean.push(m);
    std.push(Math.max(sd, 5)); // never divide by ~0 for a joint that did not move
  }
  const x: Float64Array[] = [];
  const y: Float64Array[] = [];
  for (const e of usable) {
    const dur = episodeDuration(e) || 1;
    for (const f of e.frames) {
      const xi = new Float64Array(IN);
      const yi = new Float64Array(OUT);
      for (let j = 0; j < NUM_JOINTS; j++) {
        xi[j] = (f.state[j] - mean[j]) / std[j];
        yi[j] = (f.action[j] - mean[j]) / std[j];
      }
      xi[NUM_JOINTS] = (f.t / dur) * 2 - 1; // progress: -1 at start, +1 at end
      x.push(xi);
      y.push(yi);
    }
  }
  const duration = usable.reduce((s, e) => s + episodeDuration(e), 0) / usable.length;
  return { x, y, mean, std, duration };
}

export class Policy {
  layers: Layer[];
  private m: Float64Array[] = [];
  private v: Float64Array[] = [];
  private t = 0;
  private rand: () => number;

  constructor(
    readonly config: PolicyConfig = DEFAULT_CONFIG,
    weights?: number[][],
  ) {
    this.rand = mulberry32(config.seed);
    const sizes = [IN, config.hidden, config.hidden, OUT];
    this.layers = [];
    for (let l = 0; l < sizes.length - 1; l++) {
      const nIn = sizes[l];
      const nOut = sizes[l + 1];
      const w = new Float64Array(nIn * nOut);
      const scale = Math.sqrt(1 / nIn);
      for (let i = 0; i < w.length; i++) w[i] = gaussian(this.rand) * scale;
      this.layers.push({ w, b: new Float64Array(nOut), in: nIn, out: nOut });
    }
    if (weights) this.setWeights(weights);
    for (const L of this.layers) {
      this.m.push(new Float64Array(L.w.length + L.b.length));
      this.v.push(new Float64Array(L.w.length + L.b.length));
    }
  }

  getWeights(): number[][] {
    return this.layers.map((L) => [...L.w, ...L.b]);
  }

  setWeights(weights: number[][]) {
    if (weights.length !== this.layers.length) throw new Error('Saved brain does not match');
    this.layers.forEach((L, i) => {
      const src = weights[i];
      if (src.length !== L.w.length + L.b.length || src.some((x) => !Number.isFinite(x))) {
        throw new Error('Saved brain is damaged');
      }
      L.w.set(src.slice(0, L.w.length));
      L.b.set(src.slice(L.w.length));
    });
  }

  /** Forward pass; returns activations of every layer (last = output). */
  forward(x: ArrayLike<number>): Float64Array[] {
    const acts: Float64Array[] = [Float64Array.from(x)];
    this.layers.forEach((L, li) => {
      const a = acts[acts.length - 1];
      const z = new Float64Array(L.out);
      for (let o = 0; o < L.out; o++) {
        let s = L.b[o];
        const row = o * L.in;
        for (let i = 0; i < L.in; i++) s += L.w[row + i] * a[i];
        z[o] = li < this.layers.length - 1 ? Math.tanh(s) : s;
      }
      acts.push(z);
    });
    return acts;
  }

  /** One Adam step on a random mini-batch. Returns the batch loss. */
  trainStep(data: Dataset): number {
    const { batchSize, learningRate, stateNoise } = this.config;
    const grads = this.layers.map((L) => new Float64Array(L.w.length + L.b.length));
    let loss = 0;
    const n = data.x.length;
    for (let k = 0; k < batchSize; k++) {
      const idx = Math.floor(this.rand() * n);
      const x = Float64Array.from(data.x[idx]);
      for (let j = 0; j < NUM_JOINTS; j++) x[j] += gaussian(this.rand) * stateNoise;
      const y = data.y[idx];
      const acts = this.forward(x);
      const out = acts[acts.length - 1];
      let delta = new Float64Array(OUT);
      for (let o = 0; o < OUT; o++) {
        const err = out[o] - y[o];
        loss += err * err;
        delta[o] = (2 * err) / (OUT * batchSize);
      }
      for (let li = this.layers.length - 1; li >= 0; li--) {
        const L = this.layers[li];
        const a = acts[li];
        const g = grads[li];
        const prev = new Float64Array(L.in);
        for (let o = 0; o < L.out; o++) {
          const d = delta[o];
          const row = o * L.in;
          for (let i = 0; i < L.in; i++) {
            g[row + i] += d * a[i];
            prev[i] += d * L.w[row + i];
          }
          g[L.w.length + o] += d;
        }
        if (li > 0) for (let i = 0; i < L.in; i++) prev[i] *= 1 - a[i] * a[i]; // tanh'
        delta = prev;
      }
    }
    // Adam update
    this.t++;
    const b1 = 0.9;
    const b2 = 0.999;
    const c1 = 1 - b1 ** this.t;
    const c2 = 1 - b2 ** this.t;
    this.layers.forEach((L, li) => {
      const g = grads[li];
      const m = this.m[li];
      const v = this.v[li];
      for (let i = 0; i < g.length; i++) {
        m[i] = b1 * m[i] + (1 - b1) * g[i];
        v[i] = b2 * v[i] + (1 - b2) * g[i] * g[i];
        const step = (learningRate * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + 1e-8);
        if (i < L.w.length) L.w[i] -= step;
        else L.b[i - L.w.length] -= step;
      }
    });
    return loss / (OUT * batchSize);
  }

  /** Mean squared error over the whole dataset (normalised units). */
  evaluate(data: Dataset): number {
    let s = 0;
    for (let k = 0; k < data.x.length; k++) {
      const out = this.forward(data.x[k]).pop()!;
      for (let o = 0; o < OUT; o++) s += (out[o] - data.y[k][o]) ** 2;
    }
    return s / (data.x.length * OUT);
  }
}

/** A trained policy ready to drive the follower. */
export class Skill {
  readonly policy: Policy;

  constructor(readonly saved: SavedPolicy) {
    this.policy = new Policy(saved.config, saved.weights);
  }

  /** `progress` is 0 at the start of the skill and 1 at the end. */
  act(state: Joints, progress: number): Joints {
    const { mean, std } = this.saved.norm;
    const x = new Float64Array(IN);
    for (let j = 0; j < NUM_JOINTS; j++) x[j] = (state[j] - mean[j]) / std[j];
    x[NUM_JOINTS] = Math.min(1, Math.max(0, progress)) * 2 - 1;
    const out = this.policy.forward(x).pop()!;
    return Array.from(out, (v, j) => v * std[j] + mean[j]) as Joints;
  }
}

export interface TrainProgress {
  step: number;
  totalSteps: number;
  loss: number;
}

/**
 * Train without freezing the page: works in small chunks and yields to the
 * browser between them. Pass an AbortSignal to stop early.
 */
export async function trainPolicy(
  episodes: Episode[],
  opts: {
    name: string;
    task: string;
    steps: number;
    config?: Partial<PolicyConfig>;
    onProgress?: (p: TrainProgress) => void;
    signal?: AbortSignal;
  },
): Promise<SavedPolicy> {
  const config = { ...DEFAULT_CONFIG, ...opts.config };
  const data = buildDataset(episodes);
  const policy = new Policy(config);
  let loss = NaN;
  let step = 0;
  const reportEvery = Math.max(1, Math.floor(opts.steps / 100));
  let acc = 0;
  let accN = 0;
  while (step < opts.steps) {
    if (opts.signal?.aborted) break;
    const chunkEnd = Math.min(opts.steps, step + 25);
    for (; step < chunkEnd; step++) {
      acc += policy.trainStep(data);
      accN++;
      if ((step + 1) % reportEvery === 0) {
        loss = acc / accN;
        acc = accN = 0;
        opts.onProgress?.({ step: step + 1, totalSteps: opts.steps, loss });
      }
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  return {
    version: 1,
    name: opts.name,
    task: opts.task,
    createdAt: new Date().toISOString(),
    config,
    duration: data.duration,
    episodes: episodes.length,
    steps: step,
    finalLoss: policy.evaluate(data),
    norm: { mean: data.mean, std: data.std },
    weights: policy.getWeights(),
  };
}

export function isSavedPolicy(v: unknown): v is SavedPolicy {
  if (!v || typeof v !== 'object') return false;
  const p = v as SavedPolicy;
  return (
    p.version === 1 &&
    typeof p.name === 'string' &&
    Number.isFinite(p.duration) &&
    p.duration > 0 &&
    p.duration < 600 &&
    Array.isArray(p.norm?.mean) &&
    Array.isArray(p.weights)
  );
}
