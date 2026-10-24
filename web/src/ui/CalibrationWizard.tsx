import { useEffect, useRef, useState } from 'react';
import { ArmRole } from '../arm/arm';
import { ArmCalibration, CalibrationRecorder, quickCalibration } from '../arm/calibration';
import { GRIPPER, JOINTS } from '../arm/joints';
import { ServoBus } from '../drivers/types';

type Step = 'intro' | 'middle' | 'sweep' | 'close' | 'quickOpen' | 'quickClose';

/**
 * Guided calibration: middle pose -> move every joint end to end -> close the hand.
 * Motors are off the whole time so the arm can be moved by hand.
 */
export function CalibrationWizard({
  role,
  bus,
  onDone,
  onCancel,
}: {
  role: ArmRole;
  bus: ServoBus;
  onDone: (cal: ArmCalibration) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>('intro');
  const [spans, setSpans] = useState<number[]>(new Array(6).fill(0));
  const [error, setError] = useState<string | null>(null);
  const rec = useRef(new CalibrationRecorder());
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => heading.current?.focus(), [step]);

  useEffect(() => {
    if (step !== 'sweep') return;
    let alive = true;
    const poll = async () => {
      while (alive) {
        try {
          rec.current.addSample(await bus.readRaw());
          setSpans(rec.current.max.map((mx, i) => mx - rec.current.min[i]));
        } catch {
          /* skip a missed reading */
        }
        await new Promise((r) => setTimeout(r, 50));
      }
    };
    void poll();
    return () => {
      alive = false;
    };
  }, [bus, step]);

  const [saving, setSaving] = useState(false);
  const captureMiddle = async () => {
    setSaving(true);
    try {
      // Real arms remember this pose as their middle, so no joint range crosses the 0/4095 wrap.
      const raw = bus.setHomingToMiddle ? await bus.setHomingToMiddle() : await bus.readRaw();
      rec.current.setMiddle(raw);
      setError(null);
      setStep('sweep');
    } catch {
      setError('We could not save the middle pose. Check the cable and power, then try again.');
    } finally {
      setSaving(false);
    }
  };

  const openRaw = useRef<number | null>(null);
  const captureOpen = async () => {
    try {
      openRaw.current = (await bus.readRaw())[GRIPPER];
      setError(null);
      setStep('quickClose');
    } catch {
      setError('We could not read the hand. Try again.');
    }
  };
  const captureClosed = async () => {
    try {
      const closedRaw = (await bus.readRaw())[GRIPPER];
      if (openRaw.current === null) return setStep('quickOpen');
      if (Math.abs(closedRaw - openRaw.current) < 100) {
        setError("The hand barely moved. Open it all the way, press Next, then close it all the way. Let's try again!");
        setStep('quickOpen');
        return;
      }
      // The follower should squeeze a little past where its jaw tips touch, so it can hold
      // things (measured on the SO-101: ~35 ticks past touching = ~10% motor effort).
      const squeeze = role === 'follower' ? 35 * Math.sign(closedRaw - openRaw.current) : 0;
      onDone(quickCalibration({ openRaw: openRaw.current, closedRaw: closedRaw + squeeze }));
    } catch {
      setError('We could not read the hand. Try again.');
    }
  };

  const finish = async () => {
    try {
      const raw = await bus.readRaw();
      onDone(rec.current.finish(raw[GRIPPER]));
    } catch {
      setError('We could not read the hand. Try again.');
    }
  };

  const missing = spans.map((s, i) => (s < 20 ? i : -1)).filter((i) => i >= 0);
  const name = role === 'leader' ? 'leader' : 'follower';

  return (
    <section className="card wizard" aria-labelledby="cal-title">
      <h2 id="cal-title" tabIndex={-1} ref={heading}>
        📏 Teach the computer about your {name} arm
      </h2>
      {step === 'intro' && (
        <>
          <p>Every arm is a little different. We need to learn how far each joint can move. It takes about 1 minute.</p>
          <p className="hint">
            Already set up this arm before (or with LeRobot)? Use <strong>Quick start</strong> to skip this. You can
            calibrate later with "Calibrate again".
          </p>
          {role === 'follower' && (
            <p className="callout">✋ Hold the follower arm with one hand. Its motors are off, so it might flop down.</p>
          )}
          <div className="row">
            <button className="btn primary" onClick={() => setStep('middle')}>Let's start</button>
            <button className="btn" onClick={() => setStep('quickOpen')}>⚡ Quick start (just the hand)</button>
            <button className="btn link" onClick={onCancel}>Not now</button>
          </div>
        </>
      )}
      {step === 'middle' && (
        <>
          <p><strong>Step 1 of 3:</strong> Move the arm to the <strong>middle</strong> of everything:</p>
          <ul>
            <li>Base pointing straight ahead</li>
            <li>Every joint halfway between its two ends</li>
            <li>Hand halfway open</li>
          </ul>
          <p className="hint">This matches the "middle position" picture in the LeRobot SO-101 guide.</p>
          <button className="btn primary" onClick={captureMiddle} disabled={saving}>
            {saving ? 'Saving…' : "It's in the middle"}
          </button>
        </>
      )}
      {step === 'sweep' && (
        <>
          <p><strong>Step 2 of 3:</strong> Gently move <strong>each joint</strong> all the way to both ends. Go slowly!</p>
          <ul className="sweep-list">
            {JOINTS.map((j, i) => {
              const done = spans[i] >= 20;
              return (
                <li key={j.id} className={done ? 'done' : ''}>
                  <span aria-hidden="true">{j.icon}</span> {j.name}
                  <meter min={0} max={180} value={Math.min(180, spans[i])} aria-label={`${j.name} range`} />
                  <span>{done ? '✅ got it' : 'move me'}</span>
                </li>
              );
            })}
          </ul>
          <button
            className="btn primary"
            disabled={missing.length > 0}
            onClick={() => setStep('close')}
            aria-describedby="sweep-help"
          >
            Next
          </button>
          <p id="sweep-help" className="hint">
            {missing.length ? `Still to move: ${missing.map((i) => JOINTS[i].name).join(', ')}` : 'All joints done!'}
          </p>
        </>
      )}
      {step === 'close' && (
        <>
          <p>
            <strong>Step 3 of 3:</strong> Close the hand all the way
            {role === 'leader' ? ' (squeeze the trigger and hold it)' : ''}, then press Done.
          </p>
          <button className="btn primary" onClick={finish}>Done</button>
        </>
      )}
      {step === 'quickOpen' && (
        <>
          <p>
            <strong>Quick start, step 1 of 2:</strong>{' '}
            {role === 'leader' ? 'Let go of the trigger completely.' : 'Open the hand as wide as it goes.'} Then press
            Next.
          </p>
          <button className="btn primary" onClick={captureOpen}>Next</button>
        </>
      )}
      {step === 'quickClose' && (
        <>
          <p>
            <strong>Quick start, step 2 of 2:</strong>{' '}
            {role === 'leader' ? 'Squeeze the trigger all the way and hold it.' : 'Close the hand all the way.'} Then press
            Done.
          </p>
          <button className="btn primary" onClick={captureClosed}>Done</button>
        </>
      )}
      {error && <p className="callout warn" role="alert">{error}</p>}
    </section>
  );
}
