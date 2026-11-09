import { useEffect, useRef, useState } from 'react';
import { MayaAvatar } from '../teacher/MayaAvatar';
import { TeacherAvatar } from '../teacher/TeacherAvatar';
import './studio.css';

/**
 * The "studio" page used to record the how-to videos (open the app with ?studio=1).
 * The real app runs in the framed screen; the recording script (web/studio/record.mjs)
 * drives the characters, subtitles and cursor through window.__studio.
 */
type Speaker = 'nova' | 'maya';

export interface StudioApi {
  title(title: string, subtitle: string): void;
  hideTitle(): void;
  say(speaker: Speaker, text: string, envelope: number[], ms: number): void;
  cursor(x: number, y: number): void;
  click(): void;
  outro(text: string): void;
}

const FRAME_MS = 40; // envelope step (25 per second)

export function Studio() {
  const [title, setTitle] = useState<{ title: string; subtitle: string } | null>(null);
  const [line, setLine] = useState<{ speaker: Speaker; text: string } | null>(null);
  const [mouth, setMouth] = useState<Record<Speaker, number>>({ nova: 0, maya: 0 });
  const [cursor, setCursor] = useState({ x: 470, y: 300, clicking: false, visible: false });
  const [outro, setOutro] = useState<string | null>(null);
  const anim = useRef(0);

  useEffect(() => {
    const api: StudioApi = {
      title: (t, s) => setTitle({ title: t, subtitle: s }),
      hideTitle: () => setTitle(null),
      say: (speaker, text, envelope, ms) => {
        cancelAnimationFrame(anim.current);
        setLine({ speaker, text });
        const t0 = performance.now();
        const tick = () => {
          const t = performance.now() - t0;
          const v = t < ms ? envelope[Math.floor(t / FRAME_MS)] ?? 0 : 0;
          setMouth({ nova: speaker === 'nova' ? v : 0, maya: speaker === 'maya' ? v : 0 });
          if (t < ms) anim.current = requestAnimationFrame(tick);
        };
        tick();
      },
      cursor: (x, y) => setCursor((c) => ({ ...c, x, y, visible: true })),
      click: () => {
        setCursor((c) => ({ ...c, clicking: true }));
        setTimeout(() => setCursor((c) => ({ ...c, clicking: false })), 450);
      },
      outro: (text) => {
        setLine(null);
        setOutro(text);
      },
    };
    (window as unknown as { __studio: StudioApi }).__studio = api;
  }, []);

  const speaking = (s: Speaker) => line?.speaker === s && mouth[s] > 0.02;

  return (
    <div className="studio">
      <header className="studio-top">
        <span className="studio-logo">🦾 GRIP Academy</span>
        <span className="studio-lesson">{title?.title ?? ''}</span>
      </header>
      <div className="studio-screen">
        <div className="browser-bar">
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
          <span className="url">localhost:8080 · GRIP AI Arm</span>
        </div>
        <div className="screen-clip">
          <iframe title="GRIP app" src="./?studioApp=1" className="app-frame" />
        </div>
        {cursor.visible && (
          <div className={`fake-cursor ${cursor.clicking ? 'clicking' : ''}`} style={{ left: cursor.x, top: cursor.y }}>
            <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
              <path d="M3 2 L3 20 L8 15 L11.5 22 L14.5 20.6 L11 14 L18 14 Z" fill="#fff" stroke="#1d1b2f" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
            <span className="ripple" />
          </div>
        )}
      </div>
      <aside className="studio-cast">
        <div className={`cast-tile ${speaking('nova') ? 'speaking' : ''}`}>
          <TeacherAvatar talking={false} listening={line?.speaker === 'maya'} thinking={false} mouth={mouth.nova} />
          <span className="cast-name">Ms. Nova · teacher</span>
        </div>
        <div className={`cast-tile ${speaking('maya') ? 'speaking' : ''}`}>
          <MayaAvatar mouth={mouth.maya} talking={line?.speaker === 'maya'} />
          <span className="cast-name">Maya · learner</span>
        </div>
      </aside>
      <div className="studio-subs">
        {line && (
          <p>
            <strong className={line.speaker}>{line.speaker === 'nova' ? 'Ms. Nova' : 'Maya'}:</strong> {line.text}
          </p>
        )}
      </div>
      {title && (
        <div className="studio-title">
          <span>GRIP Academy · how-to video</span>
          <strong>{title.title}</strong>
          <em>{title.subtitle}</em>
        </div>
      )}
      {outro && (
        <div className="studio-title outro">
          <strong>{outro}</strong>
          <em>Now it's your turn! 🦾</em>
        </div>
      )}
    </div>
  );
}
