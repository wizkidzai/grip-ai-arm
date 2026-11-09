import { ServoBus } from '../drivers/types';
import { ArmCalibration, jointsToRaw, limitsFromCalibration, rawToJoints } from './calibration';
import { Joints, WRIST_ROLL } from './joints';
import { JointLimit, Limits, clampTarget, safeStep } from './safety';

export type ArmRole = 'leader' | 'follower';

/**
 * Command layer for one arm. Speaks degrees and gripper %, never raw ticks,
 * and every move goes through the safety pipeline.
 */
export class Arm {
  /** Last commanded (already safe) goal. */
  private goal: Joints | null = null;
  private torqueOn = false;

  constructor(
    readonly bus: ServoBus,
    readonly role: ArmRole,
    readonly calibration: ArmCalibration,
  ) {}

  /**
   * Camera-safe range for the wrist spin (degrees), measured by hand. With a camera on
   * the wrist, spinning past it puts the camera underneath, where it can hit the table
   * or pull its cable until it snaps. Every mode goes through `limits`, so all respect it.
   */
  wristSafe: JointLimit | null = null;

  get limits(): Limits {
    const lim = limitsFromCalibration(this.calibration);
    if (this.wristSafe) {
      const w = lim[WRIST_ROLL];
      lim[WRIST_ROLL] = {
        min: Math.max(w.min, Math.min(this.wristSafe.min, this.wristSafe.max)),
        max: Math.min(w.max, Math.max(this.wristSafe.min, this.wristSafe.max)),
      };
    }
    return lim;
  }

  get torque() {
    return this.torqueOn;
  }

  async getState(): Promise<Joints> {
    return rawToJoints(await this.bus.readRaw(), this.calibration);
  }

  /**
   * Turn motors on without any jump: first set the goal to where the arm
   * already is, then enable torque.
   */
  async enableTorque(): Promise<Joints> {
    if (this.role === 'leader') throw new Error('The leader arm stays floppy so you can move it.');
    const raw = await this.bus.readRaw();
    const present = rawToJoints(raw, this.calibration);
    const hold = clampTarget(present, this.limits, present);
    // Write the exact raw reading while torque is still off, so enabling holds in place.
    await this.bus.writeRaw(raw);
    await this.bus.setTorque(true);
    this.goal = hold;
    this.torqueOn = true;
    return present;
  }

  async relax() {
    await this.bus.setTorque(false);
    this.torqueOn = false;
    this.goal = null;
  }

  /** Forget the last goal; the next move starts from the measured position. */
  resetGoal(present: Joints) {
    this.goal = clampTarget(present, this.limits, present);
  }

  /** One safe, rate-limited step towards `target`. Returns what was sent. */
  async stepToward(target: readonly number[], present: Joints, maxDegPerSec: number, dtSec: number): Promise<Joints> {
    if (!this.torqueOn) throw new Error('Motors are off');
    const base = this.goal ?? present;
    const next = safeStep(base, target, this.limits, maxDegPerSec, dtSec);
    await this.bus.writeRaw(jointsToRaw(next, this.calibration));
    this.goal = next;
    return next;
  }

  /** Stop moving: hold the current position (motors stay on). */
  async hold(): Promise<void> {
    if (!this.torqueOn) return;
    const present = await this.getState();
    this.goal = clampTarget(present, this.limits, present);
    await this.bus.writeRaw(jointsToRaw(this.goal, this.calibration));
  }

  get lastGoal(): Joints | null {
    return this.goal;
  }
}
