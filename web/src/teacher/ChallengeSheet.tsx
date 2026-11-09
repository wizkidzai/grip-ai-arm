import { useState } from 'react';
import { Challenge, KIND_LABEL } from './challenges';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Opens a clean, printable copy of the sheet (the browser's print dialog can also save a PDF). */
export function printSheet(c: Challenge, classNo: number, showBonus: boolean, notes: string) {
  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) return;
  const li = (xs: string[]) => xs.map((x) => `<li>${esc(x)}</li>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.title)} – GRIP challenge sheet</title>
<style>
body{font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 20px;color:#1d1b2f;line-height:1.5}
h1{margin:0 0 4px}.tag{color:#5b3df5;font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:.8rem}
.box{border:2px solid #5b3df5;border-radius:12px;padding:10px 16px;margin:14px 0}
ol li{margin:8px 0}ol li::marker{font-weight:800}.check{display:inline-block;width:14px;height:14px;border:2px solid #1d1b2f;border-radius:3px;margin-right:8px;vertical-align:-2px}
.lines{border-bottom:1px solid #999;height:28px}.safety{background:#fff1e6;border-color:#d97706}
</style></head><body>
<p class="tag">GRIP Academy · Class ${classNo} · ${esc(KIND_LABEL[c.kind])} challenge from Ms. Nova</p>
<h1>${esc(c.icon)} ${esc(c.title)}</h1>
<p><strong>Goal:</strong> ${esc(c.goal)}</p>
<div class="box"><strong>You need:</strong><ul>${li(c.needs)}</ul></div>
${
    c.quiz
      ? `<h2>Questions</h2><ol>${c.quiz
          .map((q) => `<li>${esc(q.q)}<br>${q.options.map((o) => `<span class="check"></span>${esc(o)} &nbsp; `).join('')}</li>`)
          .join('')}</ol>`
      : `<h2>Steps</h2><ol>${c.steps.map((s) => `<li><span class="check"></span>${esc(s)}</li>`).join('')}</ol>`
  }
<div class="box"><strong>Tips:</strong><ul>${li(c.tips)}</ul></div>
${showBonus ? `<div class="box"><strong>⭐ Bonus challenge:</strong> ${esc(c.bonus)}</div>` : ''}
<div class="box safety"><strong>Safety:</strong> hands clear before the arm moves · start on slow · only soft, light objects · STOP (or Esc) stops the arm.</div>
<h2>My notes</h2>${notes ? `<p>${esc(notes).replace(/\n/g, '<br>')}</p>` : ''}<div class="lines"></div><div class="lines"></div><div class="lines"></div>
<p>Badge to earn: <strong>${esc(c.badge)}</strong></p>
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

/** The challenge sheet shown inside the live class. */
export function ChallengeSheet({
  challenge,
  classNo,
  ticks,
  notes,
  done,
  showBonus,
  onTick,
  onNotes,
  onDone,
}: {
  challenge: Challenge;
  classNo: number;
  ticks: number[];
  notes: string;
  done: boolean;
  showBonus: boolean;
  onTick: (step: number) => void;
  onNotes: (text: string) => void;
  onDone: () => void;
}) {
  const allTicked = challenge.steps.every((_, i) => ticks.includes(i));
  const [tried, setTried] = useState<Record<number, number>>({}); // quiz: last wrong answer per question
  return (
    <div className="sheet">
      <p className="sheet-tag">
        Class {classNo} · {KIND_LABEL[challenge.kind]} challenge
      </p>
      <h3>
        <span aria-hidden="true">{challenge.icon}</span> {challenge.title}
      </h3>
      <p className="sheet-goal">
        <strong>Goal:</strong> {challenge.goal}
      </p>
      <p className="sheet-needs">
        <strong>You need:</strong> {challenge.needs.join(' · ')}
      </p>
      {challenge.quiz ? (
        <ol className="sheet-quiz">
          {challenge.quiz.map((q, i) => {
            const right = ticks.includes(i);
            return (
              <li key={i} className={right ? 'ticked' : ''}>
                <p className="quiz-q">{q.q}</p>
                <div className="quiz-options" role="group" aria-label={q.q}>
                  {q.options.map((o, k) => (
                    <button
                      key={k}
                      className={`quiz-opt ${right && k === q.answer ? 'right' : ''} ${!right && tried[i] === k ? 'wrong' : ''}`}
                      disabled={right}
                      onClick={() => {
                        if (k === q.answer) onTick(i);
                        else setTried({ ...tried, [i]: k });
                      }}
                    >
                      {o}
                    </button>
                  ))}
                </div>
                {right ? (
                  <p className="quiz-feedback right">✅ Yes! {q.why}</p>
                ) : tried[i] !== undefined ? (
                  <p className="quiz-feedback wrong">🤔 Not yet. Try another answer!</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <ol className="sheet-steps">
          {challenge.steps.map((s, i) => (
            <li key={i} className={ticks.includes(i) ? 'ticked' : ''}>
              <label>
                <input type="checkbox" checked={ticks.includes(i)} onChange={() => onTick(i)} />
                <span>{s}</span>
              </label>
            </li>
          ))}
        </ol>
      )}
      <p className="sheet-tips">💡 {challenge.tips.join(' ')}</p>
      {showBonus && (
        <p className="sheet-bonus">
          ⭐ <strong>Bonus:</strong> {challenge.bonus}
        </p>
      )}
      <label className="sheet-notes">
        My notes
        <textarea
          value={notes}
          maxLength={500}
          rows={2}
          onChange={(e) => onNotes(e.target.value)}
          placeholder="Write your results here (no names or addresses!)"
        />
      </label>
      <div className="row">
        {done ? (
          <span className="sheet-done">
            🏅 Done! You earned <strong>{challenge.badge}</strong>
          </span>
        ) : (
          <button className="btn primary" disabled={!allTicked} onClick={onDone} title={allTicked ? '' : 'Tick every step first'}>
            🎉 I did it!
          </button>
        )}
        <button className="btn small" onClick={() => printSheet(challenge, classNo, showBonus, notes)}>
          🖨️ Print
        </button>
      </div>
    </div>
  );
}
