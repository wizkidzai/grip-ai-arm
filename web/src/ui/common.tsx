import React, { useCallback, useEffect, useRef, useState } from 'react';
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

/** A list where you can pick items (or all of them) and delete them, with a confirmation. */
export function SelectableList({
  items,
  noun,
  onDelete,
  confirm,
}: {
  items: { id: string; content: React.ReactNode; actions?: React.ReactNode }[];
  /** e.g. "demo" -> "Delete 3 demos?" */
  noun: string;
  onDelete: (ids: string[]) => void;
  confirm: (title: string, body: string, ok?: string, cancel?: string) => Promise<boolean>;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Forget picks for items that no longer exist.
  const live = new Set(items.map((i) => i.id));
  const chosen = [...picked].filter((id) => live.has(id));
  const all = items.length > 0 && chosen.length === items.length;
  const plural = (n: number) => `${n} ${noun}${n === 1 ? '' : 's'}`;

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const remove = async (ids: string[]) => {
    if (!ids.length) return;
    const ok = await confirm(
      `Delete ${plural(ids.length)}?`,
      "Deleted items can't be brought back.",
      `🗑 Delete ${plural(ids.length)}`,
      'Keep them',
    );
    if (!ok) return;
    onDelete(ids);
    setPicked(new Set());
  };

  return (
    <>
      <div className="row select-bar">
        <label className="pick">
          <input
            type="checkbox"
            checked={all}
            ref={(el) => {
              if (el) el.indeterminate = chosen.length > 0 && !all;
            }}
            onChange={() => setPicked(all ? new Set() : new Set(items.map((i) => i.id)))}
          />
          Select all
        </label>
        <button className="btn small" disabled={!chosen.length} onClick={() => remove(chosen)}>
          🗑 Delete selected{chosen.length ? ` (${chosen.length})` : ''}
        </button>
        <button className="btn small danger" onClick={() => remove(items.map((i) => i.id))}>
          Delete all
        </button>
      </div>
      <ul className="episodes">
        {items.map((it) => (
          <li key={it.id} className={picked.has(it.id) ? 'picked' : ''}>
            <label className="pick">
              <input type="checkbox" checked={picked.has(it.id)} onChange={() => toggle(it.id)} />
              <span>{it.content}</span>
            </label>
            {it.actions && <span className="row">{it.actions}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}
