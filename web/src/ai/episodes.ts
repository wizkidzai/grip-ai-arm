import { Joints, isJoints } from '../arm/joints';

export const FPS = 30;

export interface Frame {
  /** Seconds since the start of the episode. */
  t: number;
  /** What the follower measured (observation.state). */
  state: Joints;
  /** Where the leader told it to go (action). */
  action: Joints;
}

export interface Episode {
  id: string;
  /** Short task description, e.g. "wave hello". No real names. */
  task: string;
  createdAt: string;
  frames: Frame[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function compactFrame(f: Frame): Frame {
  return {
    t: Math.round(f.t * 1000) / 1000,
    state: f.state.map(round1) as Joints,
    action: f.action.map(round1) as Joints,
  };
}

export function episodeDuration(e: Episode): number {
  return e.frames.length ? e.frames[e.frames.length - 1].t : 0;
}

export function isEpisode(v: unknown): v is Episode {
  if (!v || typeof v !== 'object') return false;
  const e = v as Episode;
  return (
    typeof e.id === 'string' &&
    typeof e.task === 'string' &&
    Array.isArray(e.frames) &&
    e.frames.every((f) => Number.isFinite(f?.t) && isJoints(f.state) && isJoints(f.action))
  );
}

/** Find the action at time `t` (nearest earlier frame). */
export function actionAt(e: Episode, t: number): Joints | null {
  const f = e.frames;
  if (!f.length || t > f[f.length - 1].t) return null;
  let lo = 0;
  let hi = f.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (f[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return f[lo].action;
}

/**
 * Flat, LeRobot-style rows (one per frame) so the data can be converted
 * into a LeRobot dataset for training bigger policies such as ACT.
 */
export function toLeRobotRows(episodes: Episode[]) {
  let index = 0;
  return episodes.flatMap((e, episode_index) =>
    e.frames.map((f, frame_index) => ({
      index: index++,
      episode_index,
      frame_index,
      timestamp: f.t,
      task: e.task,
      'observation.state': f.state,
      action: f.action,
    })),
  );
}
