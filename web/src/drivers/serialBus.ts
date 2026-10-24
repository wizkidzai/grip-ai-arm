import { JOINTS } from '../arm/joints';
import {
  ADDR,
  BAUD_RATE,
  HALF_TURN,
  INST,
  PingResult,
  buildPacket,
  explainMotorProblems,
  StatusPacket,
  decodePosition,
  describeServoError,
  encodeHomingOffset,
  encodePosition,
  parseStatus,
  readPacket,
  syncReadPacket,
  syncWritePacket,
  u16,
  writePacket,
} from './feetech';
import { ArmConnectionError, ServoBus } from './types';

const SERVO_IDS = JOINTS.map((j) => j.servoId);
const REPLY_TIMEOUT_MS = 40;

export function webSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/** One SO-ARM101 bus servo board, reached over WebSerial. */
export class SerialBus implements ServoBus {
  readonly kind = 'serial' as const;
  onLost?: (reason: string) => void;

  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private loopDone: Promise<void> = Promise.resolve();
  private rx = new Uint8Array(0);
  /** Bytes received since the last request was sent. */
  private rxCount = 0;
  private rxWaiters: (() => void)[] = [];
  /** Serialises transactions: only one request on the wire at a time. */
  private queue: Promise<unknown> = Promise.resolve();
  private useSyncRead = true;
  private closing = false;

  /** `port`: a port the user already allowed (from navigator.serial.getPorts()); otherwise we ask. */
  constructor(
    readonly label: string,
    private givenPort?: SerialPort,
  ) {}

  /** The underlying port, so the app can tell which allowed ports are already in use. */
  get serialPort(): SerialPort | null {
    return this.port;
  }

  async connect(): Promise<void> {
    if (!webSerialSupported()) {
      throw new ArmConnectionError('This browser cannot talk to USB devices. Try Chrome or Edge on a laptop.');
    }
    if (this.givenPort) {
      this.port = this.givenPort;
    } else {
      try {
        this.port = await navigator.serial.requestPort();
      } catch {
        throw new ArmConnectionError('No arm was picked. Plug in the USB cable and try again.');
      }
    }
    try {
      await this.port.open({ baudRate: BAUD_RATE });
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === 'InvalidStateError') {
        throw new ArmConnectionError('That arm is already connected in this tab. Pick the other one.');
      }
      throw new ArmConnectionError(
        `We couldn't open that USB port (${(e as Error)?.message ?? name}). It may be in use by another tab or program ` +
          '(like tools/teleop.py). Close it, or unplug the USB cable and plug it back in, then try again.',
      );
    }
    this.closing = false;
    this.writer = this.port.writable!.getWriter();
    this.loopDone = this.readLoop();
    navigator.serial.addEventListener('disconnect', this.handleUnplug);

    // Make sure all six servos answer before we say "connected".
    this.useSyncRead = true;
    try {
      await this.readRaw();
    } catch {
      if (!this.port?.readable) {
        // Chrome reported "The device has been lost" straight after opening. On Linux this
        // happens when a Python tool (pyserial, LeRobot) left the port with VMIN=0.
        await this.disconnect();
        throw new ArmConnectionError(
          'Chrome lost the arm right after opening it. This happens after using a Python robot tool ' +
            '(like LeRobot or tools/teleop.py). Unplug this arm\'s USB cable, plug it back in, and try again.',
        );
      }
      const report = await this.diagnose();
      await this.disconnect();
      throw new ArmConnectionError(explainMotorProblems(report));
    }
    try {
      await this.ensureFullRange();
    } catch (e) {
      console.warn('Could not check the motors\' position limits', e);
    }
  }

  /**
   * Motors can store their own position limits (an earlier LeRobot calibration
   * does this). After re-homing, those old limits no longer line up and the motor
   * silently refuses to move. Reset them to the full range; the app's own
   * calibrated software limits keep every move safe.
   * Returns how many motors needed fixing.
   */
  async ensureFullRange(): Promise<number> {
    return this.exclusive(async () => {
      const stale: number[] = [];
      for (const id of SERVO_IDS) {
        await this.send(readPacket(id, ADDR.MIN_POSITION_LIMIT, 4));
        const p = await this.receive(id);
        const min = p.params[0] | (p.params[1] << 8);
        const max = p.params[2] | (p.params[3] << 8);
        if (min !== 0 || max !== 4095) stale.push(id);
      }
      for (const id of stale) await this.writeFullRange(id);
      return stale.length;
    });
  }

  private async writeFullRange(id: number) {
    const write = async (addr: number, data: number[]) => {
      await this.send(writePacket(id, addr, data));
      await this.receive(id);
    };
    await write(ADDR.TORQUE_ENABLE, [0]);
    await write(ADDR.LOCK, [0]);
    try {
      await write(ADDR.MIN_POSITION_LIMIT, [...u16(0), ...u16(4095)]);
    } finally {
      await write(ADDR.LOCK, [1]);
    }
  }

  /** Ping every motor and report which ones answer cleanly. */
  async diagnose(): Promise<PingResult[]> {
    return this.exclusive(async () => {
      const out: PingResult[] = [];
      for (const id of SERVO_IDS) {
        let result: PingResult = 'missing';
        for (let attempt = 0; attempt < 3 && result !== 'ok'; attempt++) {
          await this.send(buildPacket(id, INST.PING));
          try {
            await this.receive(id);
            result = 'ok';
          } catch {
            // Bytes arrived but no valid reply: usually two motors answering at once.
            if (this.rxCount > 0) result = 'garbled';
          }
        }
        out.push(result);
      }
      return out;
    });
  }

  async disconnect(): Promise<void> {
    this.closing = true;
    globalThis.navigator?.serial?.removeEventListener('disconnect', this.handleUnplug);
    try {
      await this.reader?.cancel();
    } catch {
      /* already closed */
    }
    // Wait until the read loop has released its lock: Chrome refuses to close a port
    // whose stream is still locked, and the port would stay busy until Chrome restarts.
    await Promise.race([this.loopDone, new Promise((r) => setTimeout(r, 1000))]);
    try {
      this.writer?.releaseLock();
    } catch {
      /* already released */
    }
    for (let attempt = 0; attempt < 3 && this.port; attempt++) {
      try {
        await this.port.close();
        break;
      } catch (e) {
        if (!this.port.readable && !this.port.writable) break; // already closed
        console.warn('Port did not close yet, retrying:', e);
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    this.port = this.reader = this.writer = null;
  }

  async readRaw(): Promise<number[]> {
    return this.exclusive(async () => {
      if (this.useSyncRead) {
        try {
          return await this.syncReadPositions();
        } catch {
          // Some firmware does not support sync read; fall back for good.
          this.useSyncRead = false;
        }
      }
      return this.readEach();
    });
  }

  async writeRaw(raw: number[]): Promise<void> {
    if (raw.length !== SERVO_IDS.length || raw.some((r) => !Number.isFinite(r))) {
      throw new Error('Refusing to send an invalid goal position');
    }
    await this.exclusive(() =>
      this.send(
        syncWritePacket(
          ADDR.GOAL_POSITION,
          2,
          SERVO_IDS.map((id, i) => ({ id, data: encodePosition(raw[i]) })),
        ),
      ),
    );
  }

  async readVoltage(): Promise<number> {
    return this.exclusive(async () => {
      await this.send(readPacket(SERVO_IDS[0], ADDR.PRESENT_VOLTAGE, 1));
      return (await this.receive(SERVO_IDS[0])).params[0] / 10;
    });
  }

  async setHomingToMiddle(): Promise<number[]> {
    return this.exclusive(async () => {
      const writeAll = async (addr: number, data: (id: number, i: number) => number[]) => {
        for (const [i, id] of SERVO_IDS.entries()) {
          await this.send(writePacket(id, addr, data(id, i)));
          await this.receive(id);
        }
      };
      await writeAll(ADDR.TORQUE_ENABLE, () => [0]);
      await writeAll(ADDR.LOCK, () => [0]);
      try {
        await writeAll(ADDR.MIN_POSITION_LIMIT, () => [...u16(0), ...u16(4095)]);
        await writeAll(ADDR.HOMING_OFFSET, () => encodeHomingOffset(0));
        const actual = await this.readEach();
        await writeAll(ADDR.HOMING_OFFSET, (_, i) => encodeHomingOffset(actual[i] - HALF_TURN));
      } finally {
        await writeAll(ADDR.LOCK, () => [1]);
      }
      return this.readEach();
    });
  }

  private async readEach(): Promise<number[]> {
    const out: number[] = [];
    for (const id of SERVO_IDS) {
      await this.send(readPacket(id, ADDR.PRESENT_POSITION, 2));
      const p = await this.receive(id);
      out.push(decodePosition(p.params[0], p.params[1]));
    }
    return out;
  }

  async setTorque(on: boolean): Promise<void> {
    await this.exclusive(async () => {
      for (const id of SERVO_IDS) {
        await this.send(writePacket(id, ADDR.TORQUE_ENABLE, [on ? 1 : 0]));
        await this.receive(id).catch(() => undefined);
      }
    });
  }

  // --- internals ---

  private handleUnplug = (e: Event) => {
    if ((e as Event & { target: SerialPort }).target === this.port) {
      this.lost('The USB cable came out.');
    }
  };

  private lost(reason: string) {
    if (this.closing) return;
    this.disconnect();
    this.onLost?.(reason);
  }

  private async syncReadPositions(): Promise<number[]> {
    await this.send(syncReadPacket(ADDR.PRESENT_POSITION, 2, SERVO_IDS));
    const out: number[] = [];
    for (const id of SERVO_IDS) {
      const p = await this.receive(id);
      out.push(decodePosition(p.params[0], p.params[1]));
    }
    return out;
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async send(packet: Uint8Array) {
    if (!this.writer) throw new ArmConnectionError('The arm is not connected.');
    this.rx = new Uint8Array(0); // drop stale bytes from earlier replies
    this.rxCount = 0;
    try {
      await this.writer.write(packet);
    } catch (e) {
      // A write glitch: grab a fresh writer and try once more.
      try {
        this.writer.releaseLock();
      } catch {
        /* already released */
      }
      this.writer = this.port?.writable?.getWriter() ?? null;
      if (!this.writer) throw e;
      await this.writer.write(packet);
    }
  }

  private async receive(id: number): Promise<StatusPacket> {
    const deadline = performance.now() + REPLY_TIMEOUT_MS;
    for (;;) {
      const { packet, consumed } = parseStatus(this.rx);
      if (consumed) this.rx = this.rx.slice(consumed);
      if (packet) {
        if (packet.id !== id) continue;
        const errs = describeServoError(packet.error);
        if (errs.length) console.warn(`Servo ${id} reports: ${errs.join(', ')}`);
        return packet;
      }
      const left = deadline - performance.now();
      if (left <= 0) throw new Error(`Servo ${id} did not reply`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        this.rxWaiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  private async readLoop() {
    const port = this.port;
    // Non-fatal USB glitches (framing errors, buffer overruns, a break) end the
    // current stream, and Chrome gives us a fresh `port.readable`. Keep reading.
    // Only a missing stream (cable out / port closed) means the arm is gone.
    while (port && port === this.port && !this.closing && port.readable) {
      this.reader = port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value?.length) {
            const next = new Uint8Array(this.rx.length + value.length);
            next.set(this.rx);
            next.set(value, this.rx.length);
            this.rx = next;
            this.rxCount += value.length;
            const waiters = this.rxWaiters;
            this.rxWaiters = [];
            waiters.forEach((w) => w());
          }
        }
      } catch (e) {
        console.warn('Serial read glitch, reconnecting the stream:', e);
      } finally {
        try {
          this.reader?.releaseLock();
        } catch {
          /* ignore */
        }
      }
      if (this.closing) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    if (!this.closing && port === this.port) this.lost('Lost contact with the arm.');
  }
}
