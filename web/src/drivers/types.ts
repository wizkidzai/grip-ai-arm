/**
 * Low-level servo bus: raw 12-bit ticks for the six servos, in joint order.
 * Everything above this layer (Arm, teleop, AI) works in degrees / percent.
 */
export interface ServoBus {
  readonly kind: 'sim' | 'serial';
  readonly label: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readRaw(): Promise<number[]>;
  /** Fire-and-forget goal positions (no reply expected). */
  writeRaw(raw: number[]): Promise<void>;
  setTorque(on: boolean): Promise<void>;
  /**
   * Store an offset in each motor so the arm's current pose reads as the middle
   * of the range (2047). Keeps every joint's range away from the 0/4095 wrap,
   * where a motor would otherwise try to go the long way round. Returns the new readings.
   */
  setHomingToMiddle?(): Promise<number[]>;
  /** Motor supply voltage in volts (real arms only). */
  readVoltage?(): Promise<number>;
  /** Called when the cable is unplugged or the port errors. */
  onLost?: (reason: string) => void;
}

export class ArmConnectionError extends Error {}
