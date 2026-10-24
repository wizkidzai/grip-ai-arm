import { useCallback, useEffect, useRef, useState } from 'react';
import { JOINTS, Joints } from '../arm/joints';

/** "Hands clear?" confirmation before the real arm moves. */
export function useConfirm() {
  const [req, setReq] = useState<{
    title: string;
    body: string;
    ok: string;
    cancel: string;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (req && d && !d.open) d.showModal();
  }, [req]);

  const confirm = useCallback(
    (title: string, body: string, ok = '✋ Hands clear, go!', cancel = 'Wait') =>
      new Promise<boolean>((resolve) => setReq({ title, body, ok, cancel, resolve })),
    [],
  );

  const close = (ok: boolean) => {
    ref.current?.close();
    req?.resolve(ok);
    setReq(null);
  };

  const dialog = (
    <dialog ref={ref} className="dialog" aria-labelledby="confirm-title" onCancel={() => close(false)}>
      {req && (
        <>
          <h2 id="confirm-title">{req.title}</h2>
          <p>{req.body}</p>
          <div className="row">
            <button className="btn primary" onClick={() => close(true)} autoFocus>
              {req.ok}
            </button>
            <button className="btn" onClick={() => close(false)}>
              {req.cancel}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
  return { confirm, dialog };
}

export function JointReadout({ title, joints }: { title: string; joints: Joints | null }) {
  return (
    <div className="readout">
      <h3>{title}</h3>
      {joints ? (
        <dl>
          {JOINTS.map((j, i) => (
            <div key={j.id} title={j.id}>
              <dt>
                <span aria-hidden="true">{j.icon}</span> {j.name}
              </dt>
              <dd>
                {Math.round(joints[i])}
                {j.unit}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="hint">Not connected</p>
      )}
    </div>
  );
}

export function LossChart({ points }: { points: { step: number; loss: number }[] }) {
  const W = 320;
  const H = 140;
  const P = 28;
  if (points.length < 2) {
    return <div className="chart-empty">The mistakes chart appears here while the brain learns.</div>;
  }
  const maxStep = points[points.length - 1].step;
  const maxLoss = Math.max(...points.map((p) => p.loss));
  const x = (s: number) => P + ((W - P - 8) * s) / maxStep;
  const y = (l: number) => 8 + (H - P - 8) * (1 - l / maxLoss);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.step).toFixed(1)},${y(p.loss).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Mistakes went from ${points[0].loss.toFixed(3)} to ${last.loss.toFixed(3)}`}>
        <line x1={P} y1={H - P} x2={W - 8} y2={H - P} className="axis" />
        <line x1={P} y1={8} x2={P} y2={H - P} className="axis" />
        <path d={d} className="line" />
        <text x={P} y={H - 8} className="tick">0</text>
        <text x={W - 8} y={H - 8} className="tick" textAnchor="end">{maxStep} practice rounds</text>
        <text x={P - 4} y={16} className="tick" textAnchor="end" transform={`rotate(-90 ${P - 14} 16)`}>mistakes</text>
      </svg>
      <figcaption>Lower is better. Mistakes now: {last.loss.toFixed(3)}</figcaption>
    </figure>
  );
}
