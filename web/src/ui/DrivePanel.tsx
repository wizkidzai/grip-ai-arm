import { useRef, useState } from 'react';
import { GRIPPER, JOINTS, Joints } from '../arm/joints';
import { POSES, PoseName } from '../arm/poses';
import { SPEEDS, SpeedName, clampTarget } from '../arm/safety';
import { Robot } from './useRobot';

const NUDGE = 10;

export function DrivePanel({
  robot,
  confirm,
  onHighlight,
}: {
  robot: Robot;
  confirm: (t: string, b: string) => Promise<boolean>;
  onHighlight: (joint: number | null) => void;
}) {
  const { controller, telemetry, slots, motorsOn } = robot;
  const arm = slots.follower.arm;
  const ready = slots.follower.status === 'ready' && motorsOn && arm;
  const isReal = slots.follower.bus?.kind === 'serial';
  const driving = telemetry.mode === 'drive';
  const [target, setTarget] = useState<Joints | null>(null);
  const [speed, setSpeed] = useState<SpeedName>(controller.speed);
  const okayed = useRef(false);

  // While not driving, the sliders follow the real arm.
  const shown: Joints | null = driving && target ? target : telemetry.follower;

  const send = async (next: Joints) => {
    if (!arm) return;
    if (isReal && !okayed.current) {
      okayed.current = await confirm('Drive the real arm?', 'Keep hands clear of the joints. STOP is always at the top.');
      if (!okayed.current) return;
    }
    const safe = clampTarget(next, arm.limits, telemetry.follower ?? undefined);
    setTarget(safe);
    try {
      controller.drive(safe);
    } catch (e) {
      robot.setNotice({ kind: 'warn', text: (e as Error).message });
    }
  };

  const setJoint = (i: number, v: number) => {
    if (!shown) return;
    const next = [...shown] as Joints;
    next[i] = v;
    void send(next);
  };

  const changeSpeed = (s: SpeedName) => {
    setSpeed(s);
    controller.speed = s;
  };

  if (!ready || !shown) {
    return (
      <section aria-labelledby="drive-title">
        <h2 id="drive-title">Drive the arm</h2>
        <div className="empty-state card">
          <p className="big-emoji" aria-hidden="true">🕹️</p>
          <p>Move the follower arm with buttons and sliders. Connect it and turn its motors on first.</p>
          <div className="row center">
            <button className="btn primary" onClick={() => robot.startPretendFollower()}>
              🧪 Use a pretend arm
            </button>
          </div>
        </div>
      </section>
    );
  }

  const lim = arm.limits;
  return (
    <section aria-labelledby="drive-title">
      <div className="panel-head">
        <h2 id="drive-title">Drive the arm</h2>
        <p className="hint">Tap the arrows or slide. The orange arm shows where it is, green shows where it's going.</p>
      </div>

      <div className="card">
        <h3>Strike a pose</h3>
        <div className="pose-grid">
          {(Object.keys(POSES) as PoseName[]).map((k) => (
            <button key={k} className="btn pose" onClick={() => send([...POSES[k].joints] as Joints)}>
              {POSES[k].label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="row spread">
          <h3>Hand</h3>
          <span className="value-pill">{Math.round(shown[GRIPPER])}% open</span>
        </div>
        <div className="row">
          <button className="btn big hand" onClick={() => setJoint(GRIPPER, 100)}>
            ✋ Open
          </button>
          <button className="btn big hand" onClick={() => setJoint(GRIPPER, 0)}>
            ✊ Close
          </button>
        </div>
      </div>

      <div className="joint-grid">
        {JOINTS.map((j, i) =>
          i === GRIPPER ? null : (
            <div
              key={j.id}
              className="joint-card"
              onPointerEnter={() => onHighlight(i)}
              onPointerLeave={() => onHighlight(null)}
              onFocus={() => onHighlight(i)}
              onBlur={() => onHighlight(null)}
            >
              <div className="joint-head">
                <span className="joint-icon" aria-hidden="true">
                  {j.icon}
                </span>
                <span className="joint-name" title={j.id}>
                  {j.name}
                </span>
                <span className="value-pill">{Math.round(shown[i])}°</span>
              </div>
              <div className="joint-controls">
                <button
                  className="btn nudge"
                  aria-label={`${j.name} minus ${NUDGE} degrees`}
                  onClick={() => setJoint(i, shown[i] - NUDGE)}
                >
                  −
                </button>
                <input
                  type="range"
                  aria-label={j.name}
                  min={Math.ceil(lim[i].min)}
                  max={Math.floor(lim[i].max)}
                  step={1}
                  value={Math.round(shown[i])}
                  onChange={(e) => setJoint(i, Number(e.target.value))}
                  aria-valuetext={`${Math.round(shown[i])} degrees`}
                />
                <button
                  className="btn nudge"
                  aria-label={`${j.name} plus ${NUDGE} degrees`}
                  onClick={() => setJoint(i, shown[i] + NUDGE)}
                >
                  +
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      <fieldset className="speed card">
        <legend>Speed limit</legend>
        {(Object.keys(SPEEDS) as SpeedName[]).map((s) => (
          <label key={s}>
            <input type="radio" name="drive-speed" checked={speed === s} onChange={() => changeSpeed(s)} />
            {s === 'slow' ? '🐢' : s === 'medium' ? '🐇' : '🚀'} <span className="cap">{s}</span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
