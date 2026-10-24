import { Arm } from '../arm/arm';
import { GRIPPER, JOINTS, Joints } from '../arm/joints';
import { SPEEDS, SpeedName, StallDetector, clampTarget, effectiveLimits } from '../arm/safety';
import { Episode, FPS, Frame, actionAt, compactFrame, episodeDuration } from '../ai/episodes';
import { Skill } from '../ai/policy';
import { ProgramRunner } from '../blocks/runner';

export type Mode = 'idle' | 'teleop' | 'replay' | 'skill' | 'program' | 'drive';

export interface Telemetry {
  mode: Mode;
  leader: Joints | null;
  follower: Joints | null;
  goal: Joints | null;
  recording: boolean;
  recordedFrames: number;
  /** "Copy me" only: has the leader's thumb taken control of the hand yet? */
  handFollowing: boolean | null;
  /** 0..1 progress of replay / skill. */
  progress: number;
  /** Block currently running in a block program (for highlighting). */
  blockId: string | null;
  /** Where the follower is heading (drive / program modes). */
  target: Joints | null;
  hz: number;
}

export interface ControllerEvents {
  onTelemetry: (t: Telemetry) => void;
  /** Friendly message when the controller stopped by itself. */
  onAutoStop: (message: string) => void;
  /** A problem worth showing that did NOT stop anything (used in "Copy me"). */
  onWarning?: (message: string) => void;
}

/** The leader's thumb "catches" the follower's hand when within this many percent. */
export const HAND_CATCH_PERCENT = 6;
/** ...or as soon as the thumb moves this many percent from where it was at the start. */
export const HAND_MOVE_PERCENT = 12;

/** Hard cap on any single recording. */
export const MAX_RECORD_SECONDS = 60;

/**
 * The single 30 Hz motion loop. Only one mode runs at a time, and every
 * outgoing command passes through Arm.stepToward (clamp + rate limit).
 */
export class Controller {
  leader: Arm | null = null;
  /** Copy the hand the other way round (squeeze <-> let go). Set from the Teach tab. */
  handFlipped = false;
  follower: Arm | null = null;
  speed: SpeedName = 'medium';

  private mode: Mode = 'idle';
  private running = false;
  private stall = new StallDetector();
  private recording: Frame[] | null = null;
  private recordStart = 0;
  private modeStart = 0;
  private replayEpisode: Episode | null = null;
  private skill: Skill | null = null;
  private lastTick = 0;
  private hz = 0;
  private lastLeader: Joints | null = null;
  private lastFollower: Joints | null = null;
  private leaderMisses = 0;
  private recordingFull = false;
  private followerMisses = 0;
  private generation = 0;
  private handCaught = false;
  private prevLeaderHand: number | null = null;
  private leaderHandStart: number | null = null;
  private teleopBase: { leader: Joints; follower: Joints } | null = null;
  private lastWarnAt = 0;
  private program: ProgramRunner | null = null;
  private driveTarget: Joints | null = null;
  private blockId: string | null = null;

  constructor(private events: ControllerEvents) {}

  get currentMode() {
    return this.mode;
  }

  /** Start the background loop that reads both arms (even when idle). */
  start() {
    if (this.running) return;
    this.running = true;
    this.lastTick = performance.now();
    // Each start gets its own generation. A loop from an earlier start (React's dev mode
    // starts, stops and restarts effects) sees a newer generation and quits, so there is
    // never more than one loop talking to the arms. Two loops overwrite each other's steps
    // and the follower barely moves.
    void this.loop(++this.generation);
  }

  shutdown() {
    this.running = false;
    this.generation++;
  }

  startTeleop() {
    this.requireFollower();
    if (!this.leader) throw new Error('Connect the leader arm first.');
    this.enter('teleop');
    // Copy *changes* from where both arms are now (like tools/teleop.py), so the
    // arms don't need to start in the same pose and nothing jumps at the start.
    this.teleopBase =
      this.lastLeader && this.lastFollower ? { leader: this.lastLeader, follower: this.lastFollower } : null;
    this.handCaught = false;
    this.prevLeaderHand = null;
    this.leaderHandStart = null;
    this.events.onWarning?.("Squeeze the leader's thumb to take control of the hand.");
  }

  /**
   * "Pick-up" for the hand: when Copy me starts, the follower's hand stays where it is
   * (it never opens or closes by itself) until the leader's thumb reaches the hand's
   * position. From then on the hand copies the thumb directly.
   */
  private handTarget(rawLeaderHand: number, followerStart: number): number {
    // Some arms' hand motors turn the other way: the learner can flip it with one click.
    const leaderHand = this.handFlipped ? 100 - rawLeaderHand : rawLeaderHand;
    if (!this.handCaught) {
      const prev = this.prevLeaderHand;
      const crossed = prev !== null && (prev - followerStart) * (leaderHand - followerStart) <= 0;
      const close = Math.abs(leaderHand - followerStart) < HAND_CATCH_PERCENT;
      // Also catch once the thumb clearly moves: the hand never moves by itself, but it must
      // not wait forever if the thumb can't quite reach the hand's exact position.
      if (this.leaderHandStart === null) this.leaderHandStart = leaderHand;
      const moved = Math.abs(leaderHand - this.leaderHandStart) > HAND_MOVE_PERCENT;
      if (crossed || close || moved) this.handCaught = true;
    }
    this.prevLeaderHand = leaderHand;
    return this.handCaught ? leaderHand : followerStart;
  }

  /** True once the leader's thumb has taken control of the follower's hand. */
  get handFollowing(): boolean {
    return this.handCaught;
  }

  startReplay(e: Episode) {
    this.requireFollower();
    this.replayEpisode = e;
    this.enter('replay');
  }

  startSkill(skill: Skill) {
    this.requireFollower();
    this.skill = skill;
    this.enter('skill');
  }

  startProgram(runner: ProgramRunner) {
    this.requireFollower();
    this.program = runner;
    this.enter('program');
  }

  /** Drive panel: move the follower towards a pose chosen on screen. */
  drive(target: Joints) {
    this.requireFollower();
    if (this.mode !== 'drive') this.enter('drive');
    this.driveTarget = target;
  }

  /** STOP: leave any mode and hold the follower where it is. Never throws. */
  async stop(): Promise<void> {
    const wasRecording = this.recording !== null;
    this.mode = 'idle';
    this.replayEpisode = null;
    this.skill = null;
    this.program = null;
    this.driveTarget = null;
    this.blockId = null;
    if (wasRecording) this.recording = null;
    try {
      await this.follower?.hold();
    } catch {
      /* the loop will report lost connections */
    }
  }

  startRecording() {
    if (this.mode !== 'teleop') throw new Error('Start "Copy me" mode first.');
    this.recording = [];
    this.recordingFull = false;
    this.recordStart = performance.now();
  }

  /** Stop recording and return the frames (teleop keeps running). */
  finishRecording(task: string): Episode | null {
    const frames = this.recording;
    this.recording = null;
    if (!frames || frames.length < 10) return null;
    return {
      id: `ep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      task,
      createdAt: new Date().toISOString(),
      frames,
    };
  }

  cancelRecording() {
    this.recording = null;
  }

  private requireFollower() {
    if (!this.follower) throw new Error('Connect the follower arm first.');
    if (!this.follower.torque) throw new Error('Turn on the follower motors first.');
  }

  private enter(mode: Mode) {
    this.mode = mode;
    this.modeStart = performance.now();
    this.stall.reset();
    if (this.lastFollower) this.follower?.resetGoal(this.lastFollower);
  }

  /** Show a message without stopping (at most every 3 s, so it doesn't spam). */
  private warn(message: string) {
    const now = performance.now();
    if (now - this.lastWarnAt < 3000) return;
    this.lastWarnAt = now;
    this.events.onWarning?.(message);
  }

  private autoStop(message: string) {
    void this.stop();
    this.events.onAutoStop(message);
  }

  private async loop(generation: number) {
    const period = 1000 / FPS;
    while (this.running && generation === this.generation) {
      const started = performance.now();
      try {
        await this.tick(started);
      } catch (e) {
        console.error(e);
        if (this.mode === 'teleop') {
          // "Copy me" keeps going: a person is holding the leader and can press STOP.
          this.warn('The arm missed a message. Still copying!');
        } else if (this.mode !== 'idle') {
          this.autoStop('Something went wrong talking to the arm, so we stopped it to be safe.');
        }
      }
      const spent = performance.now() - started;
      await new Promise((r) => setTimeout(r, Math.max(1, period - spent)));
    }
  }

  private async tick(now: number) {
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    if (dt > 0) this.hz = this.hz * 0.9 + (1 / dt) * 0.1;

    const leader = this.leader;
    const follower = this.follower;

    if (leader) {
      try {
        this.lastLeader = await leader.getState();
        this.leaderMisses = 0;
      } catch {
        // A missed reading: the follower holds still until the leader answers again.
        if (++this.leaderMisses > 15 && this.mode === 'teleop') {
          this.warn('The leader arm is not answering, so the follower is waiting. Check its USB cable and power.');
        }
      }
    } else {
      this.lastLeader = null;
    }

    if (follower) {
      try {
        this.lastFollower = await follower.getState();
        this.followerMisses = 0;
      } catch (e) {
        if (this.mode !== 'teleop') throw e;
        // In "Copy me", keep going with the last known position.
        if (++this.followerMisses > 15) {
          this.warn('The follower arm is not answering. Check its USB cable and power.');
        }
      }
    } else {
      this.lastFollower = null;
    }

    let goal: Joints | null = follower?.lastGoal ?? null;
    let progress = 0;
    let displayTarget: Joints | null = null;

    if (follower && this.lastFollower && this.mode !== 'idle') {
      const present = this.lastFollower;
      let speed = this.speed;
      let target: Joints | null = null;
      const elapsed = (now - this.modeStart) / 1000;

      if (this.mode === 'teleop') {
        if (!this.teleopBase && this.lastLeader) {
          this.teleopBase = { leader: this.lastLeader, follower: present };
        }
        const base = this.teleopBase;
        target =
          this.leaderMisses === 0 && this.lastLeader && base
            ? (base.follower.map((f, i) =>
                // The hand copies directly (trigger let go = open, squeezed = closed); each
                // arm's calibration knows which way its own hand motor turns. Copying hand
                // *changes* could drift into "already closed" and look stuck.
                i === GRIPPER ? this.handTarget(this.lastLeader![i], f) : f + (this.lastLeader![i] - base.leader[i]),
              ) as Joints)
            : follower.lastGoal;
        if (target && base && this.lastLeader && this.leaderMisses === 0) {
          // No dead zone at the ends: if the follower can't go as far as the leader, keep
          // the target at the follower's limit and forget the extra, so the follower comes
          // back as soon as the leader turns back (instead of after "unwinding" the extra).
          const limits = effectiveLimits(follower.limits);
          for (let i = 0; i < GRIPPER; i++) {
            const clamped = Math.min(limits[i].max, Math.max(limits[i].min, target[i]));
            if (clamped !== target[i]) {
              base.follower[i] += clamped - target[i];
              target[i] = clamped;
            }
          }
        }
      } else if (this.mode === 'replay' && this.replayEpisode) {
        const dur = episodeDuration(this.replayEpisode) || 1;
        progress = Math.min(1, elapsed / dur);
        target = actionAt(this.replayEpisode, elapsed);
        if (!target) {
          void this.stop();
          this.events.onAutoStop('Replay finished! 🎉');
        }
      } else if (this.mode === 'skill' && this.skill) {
        const dur = this.skill.saved.duration;
        progress = Math.min(1, elapsed / dur);
        if (elapsed > dur) {
          void this.stop();
          this.events.onAutoStop('Your robot brain finished the skill! 🎉');
        } else {
          target = this.skill.act(present, progress);
        }
      } else if (this.mode === 'drive') {
        target = this.driveTarget;
      } else if (this.mode === 'program' && this.program) {
        const step = this.program.step(present, now);
        this.blockId = step.blockId;
        if (step.done) {
          void this.stop();
          this.events.onAutoStop(step.message ?? 'Your program finished! 🎉');
        } else {
          target = step.target;
          speed = step.speed;
        }
      }

      if (target) {
        displayTarget = clampTarget(target, follower.limits, present);
        goal = await follower.stepToward(target, present, SPEEDS[speed], dt);
        if (this.recording) {
          const t = (now - this.recordStart) / 1000;
          if (t <= MAX_RECORD_SECONDS) {
            this.recording.push(
              compactFrame({ t, state: present, action: clampTarget(target, follower.limits, present) }),
            );
          } else if (!this.recordingFull) {
            this.recordingFull = true;
            this.events.onAutoStop(`Recordings stop after ${MAX_RECORD_SECONDS} seconds. Press "Save" to keep it.`);
          }
        }
        const stalled = this.stall.update(goal, present, now);
        if (stalled >= 0) {
          const name = JOINTS[stalled].name.toLowerCase();
          if (this.mode === 'teleop') {
            this.warn(`The ${name} can't keep up. Is something in the way? Still copying.`);
            this.stall.reset();
          } else {
            this.autoStop(`The ${name} seems stuck, so we stopped. Is something in the way?`);
          }
        }
      }
    }

    this.events.onTelemetry({
      mode: this.mode,
      leader: this.lastLeader,
      follower: this.lastFollower,
      goal,
      recording: this.recording !== null,
      recordedFrames: this.recording?.length ?? 0,
      handFollowing: this.mode === 'teleop' ? this.handCaught : null,
      progress,
      blockId: this.blockId,
      target: displayTarget,
      hz: this.hz,
    });
  }
}
