import { useEffect, useRef, useState } from 'react';
import { Cutscene } from './Cutscene';
import { CheckId, LESSONS, LEVELS, Lesson, Level, STORY } from './lessons';
import './learn.css';

export interface LearnProgress {
  version: 1;
  level: Level | null;
  storySeen: boolean;
  done: string[];
  /** Lesson whose mission is in progress. */
  active: string | null;
}

const KEY = 'grip.learn';
export const LEARN_KEY = KEY;

export function loadProgress(): LearnProgress {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && v.version === 1 && Array.isArray(v.done)) {
      return {
        version: 1,
        level: v.level in LEVELS ? v.level : null,
        storySeen: !!v.storySeen,
        done: v.done.filter((d: unknown) => LESSONS.some((l) => l.id === d)),
        active: LESSONS.some((l) => l.id === v.active) ? v.active : null,
      };
    }
  } catch {
    /* fall through */
  }
  return { version: 1, level: null, storySeen: false, done: [], active: null };
}

export function saveProgress(p: LearnProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* fine */
  }
}

export const lessonById = (id: string | null) => LESSONS.find((l) => l.id === id) ?? null;

/** A lesson is open once every lesson before it is done. */
export const isUnlocked = (p: LearnProgress, index: number) => LESSONS.slice(0, index).every((l) => p.done.includes(l.id));

type View = { kind: 'home' } | { kind: 'story' } | { kind: 'lesson'; lesson: Lesson } | { kind: 'mission'; lesson: Lesson };

/** The "Teach me" overlay: story, level choice, classes and missions. */
export function Academy({
  progress,
  setProgress,
  onClose,
  onStartMission,
  onJoinCall,
  startWith,
}: {
  progress: LearnProgress;
  setProgress: (p: LearnProgress) => void;
  onClose: () => void;
  onStartMission: (lesson: Lesson) => void;
  /** Open the live class with Ms. Nova, the AI teacher. */
  onJoinCall: () => void;
  /** Open straight into a lesson (e.g. "Next class" from the mission banner). */
  startWith?: string | null;
}) {
  const [view, setView] = useState<View>(() => {
    const l = lessonById(startWith ?? null);
    if (l) return { kind: 'lesson', lesson: l };
    return progress.level && !progress.storySeen ? { kind: 'story' } : { kind: 'home' };
  });
  const box = useRef<HTMLDivElement>(null);
  const level = progress.level ?? 'explorer';

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);

  const doneCount = progress.done.length;

  return (
    <div className="academy-backdrop" role="presentation">
      <div className="academy" role="dialog" aria-modal="true" aria-labelledby="academy-title" ref={box} tabIndex={-1}>
        <header className="academy-head">
          <h2 id="academy-title">
            🎓 GRIP Academy{progress.level && <span className="level-chip">{LEVELS[progress.level].icon} {LEVELS[progress.level].label}</span>}
          </h2>
          <div className="row">
            {view.kind !== 'home' && progress.level && (
              <button className="btn small" onClick={() => setView({ kind: 'home' })}>
                🗺️ All classes
              </button>
            )}
            <button className="btn small" onClick={onClose} aria-label="Close the Academy">
              ✕ Close
            </button>
          </div>
        </header>

        {!progress.level ? (
          <LevelPicker
            onPick={(lv) => {
              setProgress({ ...progress, level: lv });
              setView({ kind: 'story' });
            }}
          />
        ) : view.kind === 'story' ? (
          <Cutscene
            title="The story of Maya and Pip"
            scenes={STORY}
            level={level}
            doneLabel="Start class 1"
            onDone={() => {
              setProgress({ ...progress, storySeen: true });
              setView({ kind: 'lesson', lesson: LESSONS[0] });
            }}
          />
        ) : view.kind === 'lesson' ? (
          <Cutscene
            key={view.lesson.id}
            title={`Class ${LESSONS.indexOf(view.lesson) + 1}: ${view.lesson.title}`}
            scenes={view.lesson.scenes}
            level={level}
            doneLabel="See your mission"
            onDone={() => setView({ kind: 'mission', lesson: view.lesson })}
          />
        ) : view.kind === 'mission' ? (
          <MissionBrief
            lesson={view.lesson}
            done={progress.done.includes(view.lesson.id)}
            onGo={() => onStartMission(view.lesson)}
            onReplay={() => setView({ kind: 'lesson', lesson: view.lesson })}
          />
        ) : (
          <div className="academy-home">
            <div className="story-card">
              <div>
                <h3>📖 The story of Maya and Pip</h3>
                <p>Why GRIP exists, and how you can teach a real robot.</p>
              </div>
              <button className="btn primary big" onClick={() => setView({ kind: 'story' })}>
                ▶ {progress.storySeen ? 'Watch again' : 'Watch the story'}
              </button>
            </div>
            <div className="call-card">
              <span className="call-card-icon" aria-hidden="true">
                📹
              </span>
              <div>
                <h3>Live class with Ms. Nova</h3>
                <p className="hint">Ask your AI robotics teacher anything. Talk or type, like a video call.</p>
              </div>
              <button className="btn primary" onClick={onJoinCall}>
                Join class
              </button>
            </div>
            <div className="row spread">
              <h3>Your classes</h3>
              <span className="hint">
                {doneCount} of {LESSONS.length} done · badges: {LESSONS.filter((l) => progress.done.includes(l.id)).map((l) => l.badge.split(' ')[0]).join(' ') || 'none yet'}
              </span>
            </div>
            <progress max={LESSONS.length} value={doneCount} aria-label="Classes completed" />
            <ol className="class-grid">
              {LESSONS.map((l, k) => {
                const done = progress.done.includes(l.id);
                const open = isUnlocked(progress, k);
                return (
                  <li key={l.id}>
                    <button
                      className={`class-card ${done ? 'done' : ''} ${open ? '' : 'locked'}`}
                      disabled={!open}
                      onClick={() => setView({ kind: 'lesson', lesson: l })}
                      aria-label={`Class ${k + 1}: ${l.title}. ${done ? 'Done.' : open ? 'Open.' : 'Locked: finish the class before it first.'}`}
                    >
                      <span className="class-num">Class {k + 1}</span>
                      <span className="class-icon" aria-hidden="true">
                        {open ? l.icon : '🔒'}
                      </span>
                      <strong>{l.title}</strong>
                      <span className="class-state">{done ? `✅ ${l.badge}` : open ? '▶ Start' : 'Locked'}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <button className="btn link" onClick={() => setProgress({ ...progress, level: null })}>
              Change level
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LevelPicker({ onPick }: { onPick: (l: Level) => void }) {
  return (
    <div className="level-picker">
      <h3>Welcome, robot trainer! 👋 Which level fits you?</h3>
      <p className="hint">You can change it any time. Everyone gets the same robot, just different amounts of detail.</p>
      <div className="level-grid">
        {(Object.keys(LEVELS) as Level[]).map((lv) => (
          <button key={lv} className="level-card" onClick={() => onPick(lv)}>
            <span className="level-icon" aria-hidden="true">
              {LEVELS[lv].icon}
            </span>
            <strong>{LEVELS[lv].label}</strong>
            <span>ages {LEVELS[lv].ages}</span>
            <span className="hint">{LEVELS[lv].blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MissionBrief({ lesson, done, onGo, onReplay }: { lesson: Lesson; done: boolean; onGo: () => void; onReplay: () => void }) {
  return (
    <div className="mission-brief">
      <p className="mission-tag">🎯 Mission for class {LESSONS.indexOf(lesson) + 1}</p>
      <h3>
        {lesson.icon} {lesson.title}
      </h3>
      <p>{lesson.mission.intro}</p>
      <ol>
        {lesson.mission.steps.map((s) => (
          <li key={s.check}>{s.text}</li>
        ))}
      </ol>
      <p className="hint">
        A guide bar stays at the top of the app while you work. It ticks each step off by itself. Earn: <strong>{lesson.badge}</strong>
      </p>
      <div className="row">
        <button className="btn primary big" onClick={onGo}>
          🚀 {done ? 'Do it again' : "Let's go!"}
        </button>
        <button className="btn" onClick={onReplay}>
          ⏮ Watch the video again
        </button>
      </div>
    </div>
  );
}

/** The guide bar shown in the app while a mission is active. */
export function MissionBanner({
  lesson,
  checks,
  complete,
  onOpenAcademy,
  onNext,
  onClose,
}: {
  lesson: Lesson;
  checks: Set<CheckId>;
  complete: boolean;
  onOpenAcademy: () => void;
  onNext: (() => void) | null;
  onClose: () => void;
}) {
  return (
    <div className={`mission-banner ${complete ? 'complete' : ''}`} role="status" aria-live="polite">
      <div className="mission-text">
        {complete ? (
          <strong>
            🎉 Class {LESSONS.indexOf(lesson) + 1} complete! You earned {lesson.badge}
          </strong>
        ) : (
          <strong>
            🎯 Class {LESSONS.indexOf(lesson) + 1} mission: {lesson.title}
          </strong>
        )}
        <ul>
          {lesson.mission.steps.map((s) => (
            <li key={s.check} className={checks.has(s.check) ? 'ticked' : ''}>
              <span aria-hidden="true">{checks.has(s.check) ? '✅' : '⬜'}</span> {s.text}
              <span className="sr-only">{checks.has(s.check) ? ' (done)' : ' (to do)'}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="row">
        {complete && onNext && (
          <button className="btn primary" onClick={onNext}>
            Next class →
          </button>
        )}
        <button className="btn small" onClick={onOpenAcademy}>
          🎓 Academy
        </button>
        <button className="btn link" onClick={onClose} aria-label="Hide the mission guide">
          ✕
        </button>
      </div>
    </div>
  );
}
