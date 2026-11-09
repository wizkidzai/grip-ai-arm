import { GRIPPER, Joints, NUM_JOINTS } from '../arm/joints';
import { Limits, SpeedName, clampTarget, SPEEDS } from '../arm/safety';
import { Skill } from '../ai/policy';
import { Command, applySet } from './program';

/** A move counts as done when every joint is this close to its target. */
const REACHED_DEG = 3;
const REACHED_GRIP = 6;
/** Hard cap on how long any program may run. */
export const MAX_RUN_SECONDS = 180;

/** Something the app should do right now (speak, play a sound). */
export type ProgramEvent = { say: string } | { sound: string };

export interface RunnerStep {
  target: Joints | null;
  speed: SpeedName;
  /** Speed limit for this move in deg/s, when a block sets its own (glide). Never above SPEEDS.fast. */
  maxSpeed?: number;
  /** One-off things to do this tick. */
  events?: ProgramEvent[];
  blockId: string | null;
  done: boolean;
  /** Set when the runner stopped for safety (shown to the learner). */
  message?: string;
}

/**
 * Steps through compiled commands, one controller tick at a time.
 * Pure logic (no timers, no I/O) so it can be unit tested.
 */
export class ProgramRunner {
  private index = -1;
  private cmdStart = 0;
  private runStart: number | null = null;
  private target: Joints | null = null;
  private speed: SpeedName;
  private skill: Skill | null = null;
  private moveTimeout = 0;
  private timedSpeed: number | null = null;
  private waitFor = 0;
  private pending: ProgramEvent[] = [];

  constructor(
    private commands: Command[],
    private limits: Limits,
    private skills: (task: string) => Skill | null,
    startSpeed: SpeedName = 'medium',
  ) {
    this.speed = startSpeed;
  }

  step(present: Joints, nowMs: number): RunnerStep {
    if (this.runStart === null) {
      this.runStart = nowMs;
      this.target = clampTarget(present, this.limits, present);
      this.next(present, nowMs);
    }
    if ((nowMs - this.runStart) / 1000 > MAX_RUN_SECONDS) {
      return this.finish(`Programs stop after ${MAX_RUN_SECONDS / 60} minutes. Press Go to run it again!`);
    }
    // Instant commands (speed) and finished commands advance right away.
    for (let guard = 0; guard < 50; guard++) {
      const cmd = this.commands[this.index];
      if (!cmd) return this.finish();
      const elapsed = (nowMs - this.cmdStart) / 1000;
      let done = false;
      switch (cmd.op) {
        case 'speed':
          done = true;
          break;
        case 'wait':
          done = elapsed >= cmd.seconds;
          break;
        case 'say':
        case 'sound':
          done = elapsed >= this.waitFor;
          break;
        case 'move':
        case 'moveBy':
        case 'moveTimed':
          done = this.reached(present) || elapsed > this.moveTimeout;
          break;
        case 'skill':
          if (!this.skill) return this.finish('That skill is missing. Train it again in the Train step.');
          if (elapsed >= this.skill.saved.duration) {
            done = true;
            this.target = clampTarget(present, this.limits, present);
          } else {
            this.target = clampTarget(
              this.skill.act(present, elapsed / this.skill.saved.duration),
              this.limits,
              present,
            );
          }
          break;
      }
      if (!done) return this.out(cmd.blockId);
      this.next(present, nowMs);
    }
    return this.out(this.commands[this.index]?.blockId ?? null);
  }

  private out(blockId: string | null): RunnerStep {
    const step: RunnerStep = { target: this.target, speed: this.speed, blockId, done: false };
    if (this.timedSpeed !== null) step.maxSpeed = this.timedSpeed;
    if (this.pending.length) {
      step.events = this.pending;
      this.pending = [];
    }
    return step;
  }

  private next(present: Joints, nowMs: number) {
    this.index++;
    this.cmdStart = nowMs;
    this.skill = null;
    this.timedSpeed = null;
    const cmd = this.commands[this.index];
    if (!cmd || !this.target) return;
    const prev = this.target;
    switch (cmd.op) {
      case 'speed':
        this.speed = cmd.speed;
        break;
      case 'move':
        this.target = clampTarget(applySet(prev, cmd.set), this.limits, present);
        break;
      case 'moveBy':
        this.target = clampTarget(
          prev.map((v, i) => v + (cmd.by[i] ?? 0)),
          this.limits,
          present,
        );
        break;
      case 'skill':
        this.skill = this.skills(cmd.task);
        break;
      case 'moveTimed':
        this.target = clampTarget(applySet(prev, cmd.set), this.limits, present);
        break;
      case 'say':
        this.pending.push({ say: cmd.text });
        // Roughly how long it takes to say, so moves after it wait for the words.
        this.waitFor = Math.min(8, Math.max(1, 0.4 + cmd.text.split(/\s+/).length * 0.38));
        break;
      case 'sound':
        this.pending.push({ sound: cmd.sound });
        this.waitFor = 0.6;
        break;
    }
    if (cmd.op === 'moveTimed') {
      // Pick the speed that arrives in the asked time, but never faster than the fast limit.
      let far = 0;
      for (let i = 0; i < NUM_JOINTS; i++) far = Math.max(far, Math.abs(this.target[i] - present[i]));
      this.timedSpeed = Math.min(SPEEDS.fast, Math.max(5, far / cmd.seconds));
      this.moveTimeout = cmd.seconds * 1.6 + 1.5;
    }
    if (cmd.op === 'move' || cmd.op === 'moveBy') {
      // Give each move enough time at the current speed, plus a margin.
      let far = 0;
      for (let i = 0; i < NUM_JOINTS; i++) far = Math.max(far, Math.abs(this.target[i] - present[i]));
      this.moveTimeout = 1.5 + (far / SPEEDS[this.speed]) * 1.6;
    }
  }

  private reached(present: Joints): boolean {
    if (!this.target) return true;
    for (let i = 0; i < NUM_JOINTS; i++) {
      const tol = i === GRIPPER ? REACHED_GRIP : REACHED_DEG;
      if (Math.abs(this.target[i] - present[i]) > tol) return false;
    }
    return true;
  }

  private finish(message?: string): RunnerStep {
    this.index = this.commands.length;
    return { target: this.target, speed: this.speed, blockId: null, done: true, message };
  }
}
