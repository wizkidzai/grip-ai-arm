import { ArmCalibration, jointsToRaw, rawToJoints, simCalibration } from '../arm/calibration';
import { HOME, Joints } from '../arm/joints';
import { ServoBus } from './types';

/** STS3215 at 12 V moves roughly this fast with no load. */
const SERVO_TICKS_PER_SEC = 2800;

/**
 * A pretend servo bus that behaves like the real one: goals are reached
 * at a finite speed, and with torque off the arm can be moved "by hand"
 * (via `setByHand`, used by the on-screen leader sliders).
 */
export class SimBus implements ServoBus {
  readonly kind = 'sim' as const;
  onLost?: (reason: string) => void;
  readonly calibration: ArmCalibration = simCalibration();

  private pos: number[];
  private goal: number[];
  private torque = false;
  private last = performance.now();

  constructor(readonly label: string) {
    this.pos = jointsToRaw([...HOME] as Joints, this.calibration);
    this.goal = [...this.pos];
  }

  async connect() {
    await new Promise((r) => setTimeout(r, 150));
  }

  async disconnect() {}

  async readRaw(): Promise<number[]> {
    this.advance();
    return [...this.pos];
  }

  async writeRaw(raw: number[]) {
    this.advance();
    if (this.torque) this.goal = raw.map((r) => Math.min(4095, Math.max(0, Math.round(r))));
  }

  async setTorque(on: boolean) {
    this.advance();
    this.torque = on;
    this.goal = [...this.pos];
  }

  /** Where the pretend arm is right now, in joint units. */
  peek(): Joints {
    return rawToJoints(this.pos, this.calibration);
  }

  /** Pretend a human moved the arm (only when torque is off). */
  setByHand(joints: Joints) {
    if (this.torque) return;
    this.pos = jointsToRaw(joints, this.calibration);
    this.goal = [...this.pos];
  }

  private advance() {
    const now = performance.now();
    const step = (SERVO_TICKS_PER_SEC * Math.min(0.2, (now - this.last) / 1000)) | 0;
    this.last = now;
    if (!this.torque) return;
    this.pos = this.pos.map((p, i) => p + Math.max(-step, Math.min(step, this.goal[i] - p)));
  }
}
