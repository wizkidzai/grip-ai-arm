/**
 * Feetech STS/SMS serial bus protocol (STS3215 servos used by SO-ARM101).
 * Packet: 0xFF 0xFF ID LEN INSTR PARAMS... CHECKSUM
 *   LEN      = number of params + 2
 *   CHECKSUM = ~(ID + LEN + INSTR + sum(PARAMS)) & 0xFF
 * Multi-byte values are little-endian.
 */

export const BROADCAST_ID = 0xfe;
export const BAUD_RATE = 1_000_000;

export const INST = {
  PING: 0x01,
  READ: 0x02,
  WRITE: 0x03,
  SYNC_READ: 0x82,
  SYNC_WRITE: 0x83,
} as const;

/**
 * STS3215 control table. The only EEPROM settings we write are the position
 * limits (reset to the full range) and the homing offset (calibration), like LeRobot.
 */
export const ADDR = {
  MIN_POSITION_LIMIT: 9,
  MAX_POSITION_LIMIT: 11,
  HOMING_OFFSET: 31,
  TORQUE_ENABLE: 40,
  ACCELERATION: 41,
  GOAL_POSITION: 42,
  PRESENT_POSITION: 56,
  PRESENT_LOAD: 60,
  PRESENT_VOLTAGE: 62,
  PRESENT_TEMPERATURE: 63,
  /** 0 = EEPROM writable, 1 = locked. */
  LOCK: 55,
} as const;

/** Middle of the 12-bit range: calibration moves each motor's middle pose here. */
export const HALF_TURN = 2047;

export function checksum(bytes: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) sum += bytes[i];
  return ~sum & 0xff;
}

export function buildPacket(id: number, instr: number, params: readonly number[] = []): Uint8Array {
  const len = params.length + 2;
  const body = [id & 0xff, len & 0xff, instr & 0xff, ...params.map((p) => p & 0xff)];
  return Uint8Array.from([0xff, 0xff, ...body, checksum(body)]);
}

export const readPacket = (id: number, addr: number, length: number) =>
  buildPacket(id, INST.READ, [addr, length]);

export const writePacket = (id: number, addr: number, data: readonly number[]) =>
  buildPacket(id, INST.WRITE, [addr, ...data]);

export function syncWritePacket(addr: number, dataLen: number, entries: { id: number; data: number[] }[]) {
  const params = [addr, dataLen];
  for (const e of entries) {
    if (e.data.length !== dataLen) throw new Error('sync write data length mismatch');
    params.push(e.id, ...e.data);
  }
  return buildPacket(BROADCAST_ID, INST.SYNC_WRITE, params);
}

export const syncReadPacket = (addr: number, length: number, ids: readonly number[]) =>
  buildPacket(BROADCAST_ID, INST.SYNC_READ, [addr, length, ...ids]);

export const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];

/** Homing offset: sign-magnitude with the sign in bit 11, magnitude up to 2047. */
/** Leader motors are low-voltage (5-7.4 V); follower motors need the 12 V adapter. */
export const LEADER_MAX_VOLTS = 9;
export const FOLLOWER_MIN_VOLTS = 9;

/** Friendly message if this arm's power doesn't match its job, else null. */
export function powerProblem(role: 'leader' | 'follower', volts: number): string | null {
  if (role === 'leader' && volts > LEADER_MAX_VOLTS) {
    return `This arm gets ${volts.toFixed(1)} V, but the leader's motors are low-voltage. Unplug its power now! The 12 V adapter goes on the follower (the one with gripper jaws), and the 5 V adapter on the leader (the one with the trigger). Or did you pick the follower's USB port?`;
  }
  if (role === 'follower' && volts < FOLLOWER_MIN_VOLTS) {
    return `This arm only gets ${volts.toFixed(1)} V, too little for the follower's 12 V motors. Plug the 12 V adapter into the follower (the one with gripper jaws). Or did you pick the leader's USB port?`;
  }
  return null;
}

export function encodeHomingOffset(offset: number): number[] {
  const mag = Math.min(2047, Math.abs(Math.round(offset)));
  return u16(offset < 0 ? mag | 0x800 : mag);
}

/** Goal position: 12-bit, clamped to 0..4095. */
export function encodePosition(raw: number): number[] {
  return u16(Math.min(4095, Math.max(0, Math.round(raw))));
}

/** Present position uses bit 15 as a sign bit. */
export function decodePosition(lo: number, hi: number): number {
  const v = lo | (hi << 8);
  return v & 0x8000 ? -(v & 0x7fff) : v;
}

export interface StatusPacket {
  id: number;
  error: number;
  params: Uint8Array;
}

/**
 * Pulls the first complete, valid status packet out of `buf`.
 * Returns the packet (or null) and how many bytes were consumed.
 * Garbage and corrupt packets are skipped.
 */
export function parseStatus(buf: Uint8Array): { packet: StatusPacket | null; consumed: number } {
  let i = 0;
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xff || buf[i + 1] !== 0xff) {
      i++;
      continue;
    }
    // Allow an extra 0xFF before the ID.
    if (i + 2 < buf.length && buf[i + 2] === 0xff) {
      i++;
      continue;
    }
    if (i + 4 > buf.length) break;
    const id = buf[i + 2];
    const len = buf[i + 3];
    const end = i + 4 + len; // index after checksum
    if (len < 2) {
      i += 2;
      continue;
    }
    if (end > buf.length) break;
    const body = buf.subarray(i + 2, end - 1);
    if (checksum(body) !== buf[end - 1]) {
      i += 2;
      continue;
    }
    return {
      packet: { id, error: buf[i + 4], params: buf.slice(i + 5, end - 1) },
      consumed: end,
    };
  }
  return { packet: null, consumed: i };
}

export const SERVO_ERRORS: Record<number, string> = {
  0x01: 'voltage',
  0x02: 'sensor',
  0x04: 'overheat',
  0x08: 'current',
  0x20: 'overload',
};

export function describeServoError(err: number): string[] {
  return Object.entries(SERVO_ERRORS)
    .filter(([bit]) => err & Number(bit))
    .map(([, name]) => name);
}

export type PingResult = 'ok' | 'garbled' | 'missing';

const MOTOR_NAMES = ['Base spin', 'Shoulder', 'Elbow', 'Wrist tilt', 'Wrist spin', 'Hand'];
const motor = (i: number) => `motor ${i + 1} (${MOTOR_NAMES[i]})`;
const list = (xs: number[]) => xs.map(motor).join(', ');

/** Turn a ping report (index = joint, IDs 1-6) into a friendly explanation. */
export function explainMotorProblems(report: PingResult[]): string {
  const missing = report.flatMap((r, i) => (r === 'missing' ? [i] : []));
  const garbled = report.flatMap((r, i) => (r === 'garbled' ? [i] : []));
  if (missing.length === report.length) {
    return 'The board is connected but no motors answered. Check the motor power supply is plugged in and switched on, and that the 3-wire cable is plugged into the board.';
  }
  if (garbled.length && missing.length) {
    return `${list(missing)} did not answer, and ${list(garbled)} gave mixed-up answers. This usually means two motors have the same ID number. Each motor needs its own ID (1 to 6). Set them up again, one motor at a time, like in the LeRobot "setup motors" step.`;
  }
  if (garbled.length) {
    return `${list(garbled)} gave mixed-up answers. Check its cable is pushed all the way in.`;
  }
  if (missing.length) {
    return `${list(missing)} did not answer. Check the cable going into ${missing.length > 1 ? 'those motors' : 'that motor'} is pushed in all the way.`;
  }
  return 'The motors answered, but reading them failed. Unplug the USB cable, plug it back in, and try again.';
}
