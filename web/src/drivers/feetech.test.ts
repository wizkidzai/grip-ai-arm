import { describe, expect, it } from 'vitest';
import {
  ADDR,
  buildPacket,
  checksum,
  decodePosition,
  encodeHomingOffset,
  explainMotorProblems,
  powerProblem,
  encodePosition,
  parseStatus,
  readPacket,
  syncReadPacket,
  syncWritePacket,
  writePacket,
} from './feetech';

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ');

describe('packet building', () => {
  it('builds a ping', () => {
    // ID 1, LEN 2, PING: checksum = ~(1+2+1) = 0xFB
    expect(hex(buildPacket(1, 0x01))).toBe('ff ff 01 02 01 fb');
  });

  it('builds a present-position read', () => {
    const p = readPacket(1, ADDR.PRESENT_POSITION, 2);
    expect(hex(p)).toBe('ff ff 01 04 02 38 02 be');
  });

  it('builds a torque write', () => {
    const p = writePacket(3, ADDR.TORQUE_ENABLE, [1]);
    expect([...p.slice(0, 7)]).toEqual([0xff, 0xff, 3, 4, 3, 40, 1]);
    expect(p[7]).toBe(checksum([3, 4, 3, 40, 1]));
  });

  it('builds a sync write of goal positions', () => {
    const p = syncWritePacket(ADDR.GOAL_POSITION, 2, [
      { id: 1, data: encodePosition(2048) },
      { id: 2, data: encodePosition(1000) },
    ]);
    expect([...p.slice(0, 7)]).toEqual([0xff, 0xff, 0xfe, 10, 0x83, 42, 2]);
    expect([...p.slice(7, 13)]).toEqual([1, 0x00, 0x08, 2, 0xe8, 0x03]);
    expect(() => syncWritePacket(42, 2, [{ id: 1, data: [1] }])).toThrow();
  });

  it('builds a sync read', () => {
    expect([...syncReadPacket(56, 2, [1, 2, 3]).slice(0, 10)]).toEqual([0xff, 0xff, 0xfe, 7, 0x82, 56, 2, 1, 2, 3]);
  });
});

describe('positions', () => {
  it('clamps goal positions to 12 bits', () => {
    expect(encodePosition(-5)).toEqual([0, 0]);
    expect(encodePosition(99999)).toEqual([0xff, 0x0f]);
  });

  it('decodes sign-magnitude present positions', () => {
    expect(decodePosition(0x00, 0x08)).toBe(2048);
    expect(decodePosition(0x0a, 0x80)).toBe(-10);
  });
});

describe('parseStatus', () => {
  const status = (id: number, err: number, params: number[]) => {
    const body = [id, params.length + 2, err, ...params];
    return [0xff, 0xff, ...body, checksum(body)];
  };

  it('parses a reply after garbage', () => {
    const buf = Uint8Array.from([0x12, 0x00, ...status(2, 0, [0x00, 0x08])]);
    const { packet, consumed } = parseStatus(buf);
    expect(packet?.id).toBe(2);
    expect([...packet!.params]).toEqual([0x00, 0x08]);
    expect(consumed).toBe(buf.length);
  });

  it('waits for an incomplete packet', () => {
    const full = status(1, 0, [1, 2]);
    expect(parseStatus(Uint8Array.from(full.slice(0, 5))).packet).toBeNull();
  });

  it('skips a packet with a bad checksum', () => {
    const bad = status(1, 0, [1, 2]);
    bad[bad.length - 1] ^= 0xff;
    const good = status(3, 0, [5, 6]);
    const { packet } = parseStatus(Uint8Array.from([...bad, ...good]));
    expect(packet?.id).toBe(3);
  });

  it('parses consecutive sync-read replies', () => {
    let buf = Uint8Array.from([...status(1, 0, [1, 0]), ...status(2, 0, [2, 0])]);
    const a = parseStatus(buf);
    buf = buf.slice(a.consumed);
    const b = parseStatus(buf);
    expect([a.packet?.id, b.packet?.id]).toEqual([1, 2]);
  });
});

describe('explainMotorProblems', () => {
  it('spots a duplicate ID (one garbled, one missing)', () => {
    const msg = explainMotorProblems(['garbled', 'missing', 'ok', 'ok', 'ok', 'ok']);
    expect(msg).toMatch(/motor 2 \(Shoulder\) did not answer/);
    expect(msg).toMatch(/motor 1 \(Base spin\) gave mixed-up/);
    expect(msg).toMatch(/same ID/);
  });

  it('blames power when nothing answers', () => {
    expect(explainMotorProblems(new Array(6).fill('missing'))).toMatch(/power supply/);
  });

  it('names a single unplugged motor', () => {
    expect(explainMotorProblems(['ok', 'ok', 'ok', 'missing', 'ok', 'ok'])).toMatch(/motor 4 \(Wrist tilt\).*that motor/);
  });
});

describe('encodeHomingOffset', () => {
  it('uses sign-magnitude with the sign in bit 11', () => {
    expect(encodeHomingOffset(0)).toEqual([0, 0]);
    expect(encodeHomingOffset(100)).toEqual([100, 0]);
    expect(encodeHomingOffset(-1819)).toEqual([(1819 | 0x800) & 0xff, (1819 | 0x800) >> 8]);
    expect(encodeHomingOffset(-5000)).toEqual([0xff, 0x0f]); // clamped to -2047
  });
});

describe('powerProblem', () => {
  it('catches swapped power adapters', () => {
    expect(powerProblem('leader', 12)).toMatch(/Unplug its power now/);
    expect(powerProblem('follower', 4.9)).toMatch(/too little/);
    expect(powerProblem('leader', 4.9)).toBeNull();
    expect(powerProblem('follower', 12)).toBeNull();
  });
});
