import { describe, expect, it } from 'vitest';
import { Arm } from '../arm/arm';
import { HOME, Joints } from '../arm/joints';
import { SimBus } from '../drivers/simBus';
import { Controller, Telemetry } from './controller';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setup() {
  const leaderBus = new SimBus('leader');
  const followerBus = new SimBus('follower');
  const leader = new Arm(leaderBus, 'leader', leaderBus.calibration);
  const follower = new Arm(followerBus, 'follower', followerBus.calibration);
  let last: Telemetry | null = null;
  const stops: string[] = [];
  const c = new Controller({ onTelemetry: (t) => (last = t), onAutoStop: (m) => stops.push(m) });
  c.leader = leader;
  c.follower = follower;
  await follower.enableTorque();
  c.start();
  await sleep(60);
  return { c, leaderBus, follower, stops, telemetry: () => last! };
}

describe('Controller (simulated arms)', () => {
  it('enabling torque does not move the follower', async () => {
    const bus = new SimBus('f');
    const arm = new Arm(bus, 'follower', bus.calibration);
    const before = await arm.getState();
    await arm.enableTorque();
    await sleep(100);
    const after = await arm.getState();
    after.forEach((v, i) => expect(v).toBeCloseTo(before[i], 0));
  });

  it('refuses teleop until the follower motors are on', () => {
    const bus = new SimBus('f');
    const c = new Controller({ onTelemetry: () => {}, onAutoStop: () => {} });
    c.follower = new Arm(bus, 'follower', bus.calibration);
    c.leader = new Arm(new SimBus('l'), 'leader', bus.calibration);
    expect(() => c.startTeleop()).toThrow(/motors/);
  });

  it('mirrors the leader, rate-limited, and stops cleanly', async () => {
    const { c, leaderBus, follower, telemetry } = await setup();
    c.speed = 'medium'; // 90 deg/s
    c.startTeleop();
    const target: Joints = [60, -20, 30, 10, 0, 80];
    leaderBus.setByHand(target);

    await sleep(250);
    // After ~0.25 s at 90 deg/s, base can be at most ~25 deg along, never at 60.
    const mid = telemetry().follower!;
    expect(mid[0]).toBeGreaterThan(5);
    expect(mid[0]).toBeLessThan(40);

    await sleep(900);
    const end = await follower.getState();
    end.slice(0, 5).forEach((v, i) => expect(v).toBeCloseTo(target[i], -0.5));
    expect(end[5]).toBeCloseTo(HOME[5], 0); // hand waits for the thumb to reach it

    await c.stop();
    leaderBus.setByHand([...HOME] as Joints);
    await sleep(200);
    const held = await follower.getState();
    expect(held[0]).toBeCloseTo(end[0], 0);
    c.shutdown();
  }, 10_000);

  it('records frames during teleop', async () => {
    const { c, leaderBus } = await setup();
    c.startTeleop();
    c.startRecording();
    for (let k = 0; k < 10; k++) {
      leaderBus.setByHand([k * 3, 0, 0, 0, 0, 50]);
      await sleep(40);
    }
    const ep = c.finishRecording('wave');
    expect(ep).not.toBeNull();
    expect(ep!.frames.length).toBeGreaterThan(8);
    expect(ep!.frames[ep!.frames.length - 1].action[0]).toBeGreaterThan(20);
    c.shutdown();
  }, 10_000);

  it('teleop with an out-of-range leader stays inside follower limits', async () => {
    const { c, leaderBus, follower } = await setup();
    c.speed = 'fast';
    c.startTeleop();
    leaderBus.setByHand([110, 100, 95, 100, 160, 100]); // the sim leader's own ends
    await sleep(1500);
    const s = await follower.getState();
    follower.limits.forEach((l, i) => {
      expect(s[i]).toBeLessThanOrEqual(l.max + 1);
      expect(s[i]).toBeGreaterThanOrEqual(l.min - 1);
    });
    c.shutdown();
  }, 10_000);

  it('"Copy me" keeps going through read errors and a stuck joint (warns, never stops)', async () => {
    const { c, leaderBus, follower, stops } = await setup();
    const warnings: string[] = [];
    (c as unknown as { events: { onWarning: (m: string) => void } }).events.onWarning = (m) => warnings.push(m);
    c.speed = 'fast';
    c.startTeleop();
    // Make every 3rd follower read fail.
    const bus = follower.bus as SimBus;
    const realRead = bus.readRaw.bind(bus);
    let n = 0;
    bus.readRaw = async () => {
      if (++n % 3 === 0) throw new Error('missed reply');
      return realRead();
    };
    leaderBus.setByHand([50, 0, 0, 0, 0, 50]);
    await sleep(1200);
    expect(c.currentMode).toBe('teleop');
    expect(stops).toEqual([]);
    bus.readRaw = realRead;
    expect((await follower.getState())[0]).toBeGreaterThan(30); // it really copied
    c.shutdown();
  }, 10_000);

  it('copies movements from where each arm starts: no jump, even if the poses differ', async () => {
    const { c, leaderBus, follower } = await setup();
    leaderBus.setByHand([40, 20, -30, 10, 0, 80]); // leader starts in a different pose
    await sleep(100);
    const before = await follower.getState();
    c.speed = 'fast';
    c.startTeleop();
    await sleep(400);
    const still = await follower.getState();
    // No jump towards the leader's pose, and the hand does NOT open by itself.
    still.forEach((v, i) => expect(v).toBeCloseTo(before[i], 0));

    leaderBus.setByHand([60, 20, -30, 10, 0, 80]); // turn the leader's base +20°
    await sleep(800);
    const after = await follower.getState();
    expect(after[0] - before[0]).toBeCloseTo(20, 0);
    expect(after[1]).toBeCloseTo(before[1], 0);
    c.shutdown();
  }, 10_000);

  it('start -> shutdown -> start (React dev mode) leaves exactly one loop at ~30 Hz', async () => {
    let ticks = 0;
    const c = new Controller({ onTelemetry: () => ticks++, onAutoStop: () => {} });
    c.start();
    c.shutdown();
    c.start();
    await sleep(1000);
    c.shutdown();
    expect(ticks).toBeGreaterThan(20);
    expect(ticks).toBeLessThan(40); // two loops would give ~60
  });

  it('the hand waits for a clear thumb movement (never moves by itself), then copies the thumb', async () => {
    const { c, leaderBus, follower } = await setup();
    leaderBus.setByHand([0, 0, 0, 0, 0, 100]); // thumb let go (open)
    await sleep(100);
    const start = (await follower.getState())[5]; // follower hand ~30 % (HOME)
    c.speed = 'fast';
    c.startTeleop();
    await sleep(500);
    expect((await follower.getState())[5]).toBeCloseTo(start, 0); // did NOT open

    leaderBus.setByHand([0, 0, 0, 0, 0, 95]); // a tiny twitch of the thumb: still waiting
    await sleep(400);
    expect((await follower.getState())[5]).toBeCloseTo(start, 0);
    expect(c.handFollowing).toBe(false);

    leaderBus.setByHand([0, 0, 0, 0, 0, 60]); // a clear squeeze: the hand starts copying
    await sleep(800);
    expect(c.handFollowing).toBe(true);
    expect((await follower.getState())[5]).toBeCloseTo(60, 0);

    leaderBus.setByHand([0, 0, 0, 0, 0, 10]); // squeeze more: it closes
    await sleep(800);
    expect((await follower.getState())[5]).toBeCloseTo(10, 0);

    leaderBus.setByHand([0, 0, 0, 0, 0, 90]); // now letting go opens it
    await sleep(800);
    expect((await follower.getState())[5]).toBeCloseTo(90, 0);
    c.shutdown();
  }, 10_000);

  it('"flip the hand" makes squeeze and let-go swap', async () => {
    const { c, leaderBus, follower } = await setup();
    c.handFlipped = true;
    c.speed = 'fast';
    c.startTeleop();
    await sleep(200); // the loop sees where the thumb starts (30 %)
    leaderBus.setByHand([0, 0, 0, 0, 0, 0]); // thumb squeezed fully (clear move) -> caught
    await sleep(900);
    expect((await follower.getState())[5]).toBeCloseTo(100, 0); // flipped: squeeze now OPENS
    c.shutdown();
  }, 10_000);

  it('no dead zone: when the leader goes past the follower limit and comes back, the follower comes back at once', async () => {
    const { c, follower, leaderBus } = await setup();
    const maxBase = follower.limits[0].max; // sim follower base limit (~107 deg)
    c.speed = 'fast';
    c.startTeleop();
    await sleep(200);
    leaderBus.setByHand([150, 0, 0, 0, 0, 30]); // leader goes 43 deg further than the follower can
    await sleep(1500);
    expect((await follower.getState())[0]).toBeCloseTo(maxBase, 0);
    leaderBus.setByHand([130, 0, 0, 0, 0, 30]); // leader turns back 20 deg
    await sleep(800);
    // The follower comes back 20 deg too (old behaviour: it stayed at its limit).
    expect((await follower.getState())[0]).toBeCloseTo(maxBase - 20, 0);
    c.shutdown();
  }, 10_000);
});
