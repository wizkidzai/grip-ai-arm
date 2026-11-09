import { useCallback, useEffect, useRef, useState } from 'react';
import { Arm, ArmRole } from '../arm/arm';
import { ArmCalibration } from '../arm/calibration';
import { Controller, Telemetry } from '../control/controller';
import { SerialBus } from '../drivers/serialBus';
import { SimBus } from '../drivers/simBus';
import { powerProblem } from '../drivers/feetech';
import { ArmConnectionError, ServoBus } from '../drivers/types';
import { storage } from '../storage';
import { playSound } from '../sounds';
import { VoicePlayer } from '../voice';

/** The voice Pip uses for the "say" block. */
const programVoice = new VoicePlayer();

export type Ask = (title: string, body: string, ok?: string, cancel?: string) => Promise<boolean>;

export type ArmStatus = 'none' | 'connecting' | 'needs-calibration' | 'ready';

export interface ArmSlot {
  status: ArmStatus;
  bus: ServoBus | null;
  arm: Arm | null;
}

export interface Notice {
  kind: 'info' | 'warn' | 'success';
  text: string;
}

const EMPTY: ArmSlot = { status: 'none', bus: null, arm: null };

const EMPTY_TELEMETRY: Telemetry = {
  mode: 'idle',
  leader: null,
  follower: null,
  goal: null,
  recording: false,
  recordedFrames: 0,
  handFollowing: null,
  progress: 0,
  blockId: null,
  target: null,
  hz: 0,
};

export function useRobot() {
  const [slots, setSlots] = useState<Record<ArmRole, ArmSlot>>({ leader: EMPTY, follower: EMPTY });
  const [telemetry, setTelemetry] = useState<Telemetry>(EMPTY_TELEMETRY);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [motorsOn, setMotorsOn] = useState(false);
  const [wristSafe, setWristSafeState] = useState<{ min: number; max: number } | null>(null);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  const controllerRef = useRef<Controller>();
  if (!controllerRef.current) {
    controllerRef.current = new Controller({
      onTelemetry: setTelemetry,
      onAutoStop: (text) => setNotice({ kind: text.includes('🎉') ? 'success' : 'warn', text }),
      onWarning: (text) => setNotice({ kind: 'info', text }),
      // Block programs: "say" uses the natural voice, "play sound" a little browser sound.
      onProgramEvent: (e) => {
        if ('say' in e) programVoice.say(e.say);
        else playSound(e.sound);
      },
    });
  }
  const controller = controllerRef.current;
  const [handFlipped, setHandFlippedState] = useState(() => {
    try {
      return localStorage.getItem('grip.handFlipped') === '1';
    } catch {
      return false;
    }
  });
  controller.handFlipped = handFlipped;
  const setHandFlipped = useCallback((v: boolean) => {
    controller.handFlipped = v;
    setHandFlippedState(v);
    try {
      localStorage.setItem('grip.handFlipped', v ? '1' : '0');
    } catch {
      /* fine */
    }
  }, [controller]);

  useEffect(() => {
    controller.start();
    return () => controller.shutdown();
  }, [controller]);

  const setSlot = useCallback((role: ArmRole, slot: ArmSlot) => {
    // Update the ref right away too: connect steps run back-to-back between renders.
    slotsRef.current = { ...slotsRef.current, [role]: slot };
    setSlots((s) => ({ ...s, [role]: slot }));
  }, []);

  const stop = useCallback(() => {
    programVoice.stop(); // STOP also stops Pip talking
    void controller.stop();
  }, [controller]);

  // Let go of the USB ports when the tab closes or reloads, so Chrome doesn't keep
  // them busy (which blocks reconnecting and other programs like tools/teleop.py).
  useEffect(() => {
    const release = () => {
      for (const slot of Object.values(slotsRef.current)) {
        if (slot.bus?.kind === 'serial') void slot.bus.disconnect();
      }
    };
    window.addEventListener('pagehide', release);
    return () => window.removeEventListener('pagehide', release);
  }, []);

  // Safety: stop whenever the learner switches tabs or hides the window.
  useEffect(() => {
    const onHide = () => {
      // "Copy me" keeps going: a person is holding the leader arm.
      if (document.hidden && controller.currentMode !== 'idle' && controller.currentMode !== 'teleop') {
        void controller.stop();
        setNotice({ kind: 'info', text: 'We paused the arm while you were away.' });
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [controller]);

  const attach = useCallback(
    (role: ArmRole, bus: ServoBus, cal: ArmCalibration) => {
      const arm = new Arm(bus, role, cal);
      if (role === 'leader') controller.leader = arm;
      else {
        arm.wristSafe = bus.kind === 'serial' ? storage.loadWristSafe(cal.createdAt) : null;
        setWristSafeState(arm.wristSafe);
        controller.follower = arm;
      }
      setSlot(role, { status: 'ready', bus, arm });
      return arm;
    },
    [controller, setSlot],
  );

  const detach = useCallback(
    async (role: ArmRole) => {
      await controller.stop();
      const slot = slotsRef.current[role];
      if (role === 'leader') controller.leader = null;
      else {
        controller.follower = null;
        setMotorsOn(false);
      }
      setSlot(role, EMPTY);
      return slot;
    },
    [controller, setSlot],
  );

  /**
   * Connect an arm. Returns the role it ended up in (or null). Both arms show up in
   * Chrome's picker as "USB Single Serial", so if the picked arm's power says it's
   * the other arm, we ask (never guess: swapped power adapters look the same).
   */
  const connect = useCallback(
    async (
      wanted: ArmRole,
      kind: 'sim' | 'serial',
      ask?: Ask,
      opts: { port?: SerialPort; autoRole?: boolean } = {},
    ): Promise<ArmRole | null> => {
      let role = wanted;
      const label = role === 'leader' ? 'Leader arm' : 'Follower arm';
      const bus: ServoBus = kind === 'sim' ? new SimBus(label) : new SerialBus(label, opts.port);
      bus.onLost = (reason) => {
        void detach(role);
        setNotice({ kind: 'warn', text: `${reason} We stopped everything to be safe. Plug it back in and connect again.` });
      };
      setSlot(role, { status: 'connecting', bus, arm: null });
      try {
        await bus.connect();
        // Catch swapped power adapters / swapped USB ports before anything moves.
        const volts = await bus.readVoltage?.();
        if (volts !== undefined && powerProblem(role, volts)) {
          const other: ArmRole = role === 'leader' ? 'follower' : 'leader';
          const otherFree = slotsRef.current[other].status === 'none';
          // Connecting never moves anything, so with autoRole we just put it in the right
          // place; "Turn motors on" still asks the learner to check it's the right arm.
          const ok =
            otherFree &&
            (opts.autoRole ||
              (ask &&
                (await ask(
              other === 'follower' ? `That's the follower arm 🤖` : `That's the leader arm 🎮`,
              other === 'follower'
                ? `The arm you picked gets ${volts.toFixed(1)} V, so it's the follower. Is it the one with the gripper jaws? If it's actually the one with the trigger handle, choose "No" and swap the power adapters first!`
                : `The arm you picked gets ${volts.toFixed(1)} V, so it's the leader. Is it the one with the trigger handle?`,
              other === 'follower' ? 'Yes, connect the follower' : 'Yes, connect the leader',
              'No',
            ))));
          if (!ok) throw new ArmConnectionError(powerProblem(role, volts)!);
          setSlot(role, EMPTY);
          role = other;
          setSlot(role, { status: 'connecting', bus, arm: null });
        }
        // Start floppy: the leader always, and the follower until the learner turns motors on.
        await bus.setTorque(false);
      } catch (e) {
        await bus.disconnect().catch(() => undefined);
        setSlot(role, EMPTY);
        setNotice({
          kind: 'warn',
          text: e instanceof ArmConnectionError ? e.message : 'We could not connect. Unplug the USB cable, plug it back in, and try again.',
        });
        return null;
      }
      if (bus instanceof SimBus) {
        attach(role, bus, bus.calibration);
      } else {
        const cal = storage.loadCalibration(role);
        if (cal) attach(role, bus, cal);
        else setSlot(role, { status: 'needs-calibration', bus, arm: null });
      }
      return role;
    },
    [attach, detach, setSlot],
  );

  /**
   * "Connect both arms": reconnects arms Chrome already allowed (no pop-up), sorting
   * them into leader/follower by their power. Arms Chrome hasn't seen yet need the
   * pop-up, which Chrome only shows right after a click, so that's one arm per click.
   */
  const connectBoth = useCallback(
    async (ask: Ask) => {
      const inUse = Object.values(slotsRef.current).map((s) => (s.bus as SerialBus | null)?.serialPort);
      const known = (await navigator.serial.getPorts()).filter((p) => !inUse.includes(p));
      for (const port of known) {
        const free: ArmRole | undefined = (['leader', 'follower'] as ArmRole[]).find(
          (r) => slotsRef.current[r].status === 'none',
        );
        if (!free) break;
        await connect(free, 'serial', ask, { port, autoRole: true });
      }
      const missing = (['leader', 'follower'] as ArmRole[]).filter((r) => slotsRef.current[r].status === 'none');
      if (missing.length === 2) {
        await connect('leader', 'serial', ask); // first time: Chrome's pop-up
      } else if (missing.length === 1 && known.length === 0) {
        await connect(missing[0], 'serial', ask);
      }
      const still = (['leader', 'follower'] as ArmRole[]).filter((r) => slotsRef.current[r].status === 'none');
      if (still.length) {
        setNotice({
          kind: 'info',
          text: `Almost! Click "Connect both arms" again and pick the other "USB Single Serial" for the ${still[0]}.`,
        });
      }
    },
    [connect],
  );

  const disconnect = useCallback(
    async (role: ArmRole) => {
      const slot = await detach(role);
      try {
        await slot.bus?.setTorque(false);
      } catch {
        /* already gone */
      }
      await slot.bus?.disconnect();
    },
    [detach],
  );

  const recalibrate = useCallback(
    async (role: ArmRole) => {
      const slot = await detach(role);
      if (!slot.bus) return;
      await slot.bus.setTorque(false);
      setSlot(role, { status: 'needs-calibration', bus: slot.bus, arm: null });
    },
    [detach, setSlot],
  );

  const finishCalibration = useCallback(
    (role: ArmRole, cal: ArmCalibration) => {
      const bus = slotsRef.current[role].bus;
      if (!bus) return;
      // A new calibration changes the follower's angles, so the old camera-safe range is wrong.
      if (role === 'follower') storage.clearWristSafe();
      if (!storage.saveCalibration(role, cal)) {
        setNotice({ kind: 'warn', text: 'We could not save the calibration in this browser, but you can keep going.' });
      }
      attach(role, bus, cal);
      setNotice({ kind: 'success', text: 'Calibration done! Great job. 🎉' });
    },
    [attach],
  );

  const setMotors = useCallback(
    async (on: boolean) => {
      const arm = slotsRef.current.follower.arm;
      if (!arm) return;
      try {
        if (on) await arm.enableTorque();
        else {
          await controller.stop();
          await arm.relax();
        }
        setMotorsOn(on);
      } catch {
        setNotice({ kind: 'warn', text: 'The motors did not respond. Is the power supply switched on?' });
      }
    },
    [controller],
  );

  /** One click: a pretend follower with motors on, so kids can try things safely. */
  const startPretendFollower = useCallback(async () => {
    if (slotsRef.current.follower.status !== 'none') await disconnect('follower');
    const bus = new SimBus('Follower arm');
    await bus.connect();
    const arm = attach('follower', bus, bus.calibration);
    await arm.enableTorque();
    setMotorsOn(true);
  }, [attach, disconnect]);

  /** Save the camera-safe wrist range (degrees); `null` clears it. */
  const setWristSafe = useCallback((range: { min: number; max: number } | null) => {
    const arm = slotsRef.current.follower.arm;
    if (!arm) return;
    arm.wristSafe = range;
    setWristSafeState(range);
    if (range) storage.saveWristSafe(arm.calibration.createdAt, range.min, range.max);
    else storage.clearWristSafe();
  }, []);

  return {
    controller,
    wristSafe,
    setWristSafe,
    handFlipped,
    setHandFlipped,
    connectBoth,
    startPretendFollower,
    slots,
    telemetry,
    notice,
    setNotice,
    motorsOn,
    connect,
    disconnect,
    recalibrate,
    finishCalibration,
    setMotors,
    stop,
  };
}

export type Robot = ReturnType<typeof useRobot>;
