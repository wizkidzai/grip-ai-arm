import { describe, expect, it } from 'vitest';
import { SerialBus } from './serialBus';

/** A fake WebSerial port whose first read stream fails with a glitch, like a framing error. */
function glitchyPort() {
  let streams = 0;
  const port = {
    get readable() {
      streams++;
      if (streams === 1) {
        return new ReadableStream<Uint8Array>({
          start(c) {
            c.error(new DOMException('Framing error', 'FramingError'));
          },
        });
      }
      return new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(Uint8Array.from([1, 2, 3]));
        },
      });
    },
  };
  return { port, streams: () => streams };
}

describe('SerialBus read loop', () => {
  it('keeps the arm connected through a USB glitch and keeps reading', async () => {
    const bus = new SerialBus('test');
    const lost: string[] = [];
    bus.onLost = (r) => lost.push(r);
    const { port, streams } = glitchyPort();
    const internals = bus as unknown as { port: unknown; closing: boolean; rxCount: number; readLoop(): Promise<void> };
    internals.port = port;
    void internals.readLoop();
    await new Promise((r) => setTimeout(r, 100));
    expect(lost).toEqual([]);
    expect(streams()).toBeGreaterThanOrEqual(2);
    expect(internals.rxCount).toBe(3);
    internals.closing = true;
  });

  it('Disconnect really closes the port (Chrome refuses while the stream is locked)', async () => {
    const bus = new SerialBus('test');
    let closed = false;
    let stream: ReadableStream<Uint8Array> | null = new ReadableStream<Uint8Array>({ start() {} });
    const port = {
      get readable() {
        return closed ? null : stream;
      },
      writable: null,
      async close() {
        if (stream?.locked) throw new TypeError("Failed to execute 'close' on 'SerialPort': Cannot cancel a locked stream");
        closed = true;
        stream = null;
      },
    };
    const internals = bus as unknown as { port: unknown; closing: boolean; loopDone: Promise<void>; readLoop(): Promise<void> };
    internals.port = port;
    internals.loopDone = internals.readLoop();
    await new Promise((r) => setTimeout(r, 20));
    await bus.disconnect();
    expect(closed).toBe(true);
  });
});
