import { useReducer } from 'react';
import { ArmRole } from '../arm/arm';
import { JOINTS } from '../arm/joints';
import { SimBus } from '../drivers/simBus';
import { webSerialSupported } from '../drivers/serialBus';
import { Ask, Robot } from './useRobot';

const ROLE_TEXT: Record<ArmRole, { title: string; icon: string; blurb: string }> = {
  leader: {
    title: 'Leader arm',
    icon: '🎮',
    blurb: 'The one YOU move with your hand. It is the controller.',
  },
  follower: {
    title: 'Follower arm',
    icon: '🤖',
    blurb: 'The one with strong motors. It copies the leader and learns.',
  },
};

export function ConnectPanel({ robot, confirm }: { robot: Robot; confirm: Ask }) {
  const serial = webSerialSupported();
  return (
    <section aria-labelledby="connect-title">
      <h2 id="connect-title">1. Connect your arms</h2>
      {!serial && (
        <p className="callout">
          This browser can't talk to USB robots. You can still play with pretend arms! For real arms, use Chrome or
          Edge on a laptop.
        </p>
      )}
      {serial && (robot.slots.leader.status === 'none' || robot.slots.follower.status === 'none') && (
        <div className="card connect-both">
          <button className="btn primary big" onClick={() => robot.connectBoth(confirm)}>
            🔌 Connect both arms
          </button>
          <p className="hint">
            Both arms are called "USB Single Serial" in Chrome's list. Pick either one. The app works out which arm it
            is from its power (follower 12 V, leader 5 V). After the first time, this reconnects both in one click.
          </p>
        </div>
      )}
      <div className="grid2">
        {(['leader', 'follower'] as ArmRole[]).map((role) => (
          <ArmCard key={role} role={role} robot={robot} serial={serial} confirm={confirm} />
        ))}
      </div>
    </section>
  );
}

function ArmCard({
  role,
  robot,
  serial,
  confirm,
}: {
  role: ArmRole;
  robot: Robot;
  serial: boolean;
  confirm: Ask;
}) {
  const slot = robot.slots[role];
  const t = ROLE_TEXT[role];
  const isSim = slot.bus?.kind === 'sim';

  const turnOn = async () => {
    if (!isSim) {
      const ok = await confirm(
        'Turn on the follower motors?',
        'Check: this should be the arm with the gripper jaws, on the 12 V adapter. It will hold its position and get stiff. Keep fingers and hair away from the joints.',
      );
      if (!ok) return;
    }
    await robot.setMotors(true);
  };

  return (
    <div className={`card arm-card ${slot.status}`}>
      <h3>
        <span aria-hidden="true">{t.icon}</span> {t.title}
      </h3>
      <p>{t.blurb}</p>
      {slot.status === 'none' && (
        <div className="row">
          <button className="btn primary" onClick={() => robot.connect(role, 'serial', confirm)} disabled={!serial}>
            🔌 Connect real arm
          </button>
          <button className="btn" onClick={() => robot.connect(role, 'sim')}>
            🧪 Use a pretend arm
          </button>
        </div>
      )}
      {slot.status === 'connecting' && <p role="status">Connecting… pick the arm's USB port in the pop-up.</p>}
      {slot.status === 'needs-calibration' && <p role="status">Connected! Let's calibrate it below.</p>}
      {slot.status === 'ready' && (
        <>
          <p role="status" className="ok">
            ✅ Connected {isSim ? '(pretend arm)' : '(real arm)'}
          </p>
          {role === 'follower' && (
            <div className="row">
              {robot.motorsOn ? (
                <button className="btn" onClick={() => robot.setMotors(false)}>
                  😴 Motors off (floppy)
                </button>
              ) : (
                <button className="btn primary" onClick={turnOn}>
                  ⚡ Turn motors on
                </button>
              )}
            </div>
          )}
          <div className="row small">
            {!isSim && (
              <button className="btn link" onClick={() => robot.recalibrate(role)}>
                Calibrate again
              </button>
            )}
            <button className="btn link" onClick={() => robot.disconnect(role)}>
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** With a pretend leader, these sliders are "your hand" moving it. */
export function SimLeaderSliders({ robot }: { robot: Robot }) {
  const bus = robot.slots.leader.bus;
  const arm = robot.slots.leader.arm;
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  if (!(bus instanceof SimBus) || !arm || !robot.telemetry.leader) return null;
  // Read the live position (not the last screen update) so fast key presses add up.
  const now = bus.peek();
  const lim = arm.limits;
  const set = (i: number, v: number) => {
    const next = bus.peek();
    next[i] = v;
    bus.setByHand(next);
    rerender();
  };
  return (
    <section className="card" aria-labelledby="sliders-title">
      <h3 id="sliders-title">🎮 Move the pretend leader arm</h3>
      <p className="hint">These sliders are your hand on the leader. The follower copies when "Copy me" is on.</p>
      <div className="sliders">
        {JOINTS.map((j, i) => (
          <label key={j.id}>
            <span>
              <span aria-hidden="true">{j.icon}</span> {j.name}
            </span>
            <input
              type="range"
              min={Math.ceil(lim[i].min)}
              max={Math.floor(lim[i].max)}
              step={1}
              value={Math.round(now[i])}
              onChange={(e) => set(i, Number(e.target.value))}
              aria-valuetext={`${Math.round(now[i])}${j.unit === '%' ? ' percent' : ' degrees'}`}
            />
            <output>
              {Math.round(now[i])}
              {j.unit}
            </output>
          </label>
        ))}
      </div>
    </section>
  );
}
