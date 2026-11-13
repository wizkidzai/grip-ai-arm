import { Suspense, lazy, useEffect, useState, useRef } from 'react';
import { Episode } from './ai/episodes';
import { SavedPolicy } from './ai/policy';
import { ArmRole } from './arm/arm';
import { Mode } from './control/controller';
import { GRIPPER, Joints } from './arm/joints';
import { solveTip } from './arm/ik';
import { clampTarget } from './arm/safety';
import { storage } from './storage';
import { ArmPreview } from './ui/ArmPreview';
import { CalibrationWizard } from './ui/CalibrationWizard';
import { ConnectPanel, SimLeaderSliders } from './ui/ConnectPanel';
import { DrivePanel } from './ui/DrivePanel';
import { Academy, LearnProgress, MissionBanner, lessonById, loadProgress, saveProgress } from './learn/Academy';
import { CheckId, LESSONS, Lesson } from './learn/lessons';
import { AppContext, TeacherCall } from './teacher/TeacherCall';
import { SettingsPanel } from './ui/SettingsPanel';
import { TeachPanel } from './ui/TeachPanel';
import { RunPanel, TrainPanel } from './ui/TrainPanel';
import { useConfirm } from './ui/common';
import { Robot, useRobot } from './ui/useRobot';

// Blockly is big, so it only loads when someone opens the Code tab.
const CodePanel = lazy(() => import('./ui/CodePanel'));

const TABS = [
  { id: 'connect', icon: '🔌', label: 'Connect' },
  { id: 'drive', icon: '🕹️', label: 'Drive' },
  { id: 'code', icon: '🧩', label: 'Code' },
  { id: 'teach', icon: '🪞', label: 'Teach' },
  { id: 'train', icon: '🧠', label: 'Train' },
  { id: 'run', icon: '🚀', label: 'Try it' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const MODE_TEXT: Record<Mode, string> = {
  idle: 'Resting',
  teleop: 'Copying the leader',
  replay: 'Replaying a demo',
  skill: 'Robot brain is driving',
  program: 'Running your blocks',
  drive: 'Driving',
};

const TAB_KEY = 'grip.tab';

export default function App() {
  const robot = useRobot();
  const { confirm, dialog } = useConfirm();
  const [tab, setTabState] = useState<TabId>(() => {
    try {
      const t = localStorage.getItem(TAB_KEY);
      return TABS.some((x) => x.id === t) ? (t as TabId) : 'connect';
    } catch {
      return 'connect';
    }
  });
  const [episodes, setEpisodesState] = useState<Episode[]>(() => storage.loadEpisodes());
  const [skills, setSkillsState] = useState<SavedPolicy[]>(() => storage.loadSkills());
  const [highlight, setHighlight] = useState<number | null>(null);
  const { telemetry, notice, setNotice } = robot;

  // ---- GRIP Academy ("Teach me"): story, classes and missions ----
  const [learn, setLearnState] = useState<LearnProgress>(loadProgress);
  const [academyOpen, setAcademyOpen] = useState(false);
  const [academyStart, setAcademyStart] = useState<string | null>(null);
  const [checks, setChecks] = useState<Set<CheckId>>(new Set());
  const baseline = useRef({ episodes: 0, skills: 0 });
  const prevMode = useRef(telemetry.mode);
  const setLearn = (p: LearnProgress) => {
    setLearnState(p);
    saveProgress(p);
  };
  const mission = lessonById(learn.active);
  const tick = (c: CheckId) => setChecks((s) => (s.has(c) ? s : new Set(s).add(c)));
  const stop = () => {
    robot.stop();
    tick('stopPressed');
  };
  const startMission = (lesson: Lesson) => {
    baseline.current = { episodes: episodes.length, skills: skills.length };
    setChecks(new Set());
    setLearn({ ...learn, active: lesson.id });
    setAcademyOpen(false);
    setTab(lesson.mission.tab);
  };
  // Watch what the learner does, so mission steps tick themselves off.
  useEffect(() => {
    if (!mission) return;
    if (robot.slots.follower.status === 'ready') tick('followerReady');
    if (telemetry.mode === 'drive') tick('drove');
    if (telemetry.mode === 'teleop') tick('copied');
    if (prevMode.current === 'program' && telemetry.mode === 'idle' && /program finished/i.test(notice?.text ?? '')) tick('programFinished');
    if (prevMode.current === 'skill' && telemetry.mode === 'idle') tick('skillRun');
    if (episodes.length > baseline.current.episodes) tick('recorded');
    if (skills.length > baseline.current.skills) tick('trained');
    prevMode.current = telemetry.mode;
  });
  const missionComplete = !!mission && mission.mission.steps.every((s) => checks.has(s.check));
  useEffect(() => {
    if (mission && missionComplete && !learn.done.includes(mission.id)) {
      setLearn({ ...learn, done: [...learn.done, mission.id] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionComplete]);
  const nextLesson = mission ? LESSONS[LESSONS.indexOf(mission) + 1] ?? null : null;

  // ---- Live class with Ms. Nova (AI teacher) ----
  const [callOpen, setCallOpen] = useState(false);
  const armText = (role: 'leader' | 'follower') => {
    const s = robot.slots[role];
    if (s.status !== 'ready') return s.status === 'none' ? 'not connected' : s.status;
    const kind = s.bus?.kind === 'sim' ? 'pretend arm' : 'real arm';
    return role === 'follower' ? `${kind}, motors ${robot.motorsOn ? 'on' : 'off'}` : kind;
  };
  const teacherContext: AppContext = {
    level: learn.level ?? 'explorer',
    tab,
    leader: armText('leader'),
    follower: armText('follower'),
    mode: telemetry.mode,
    mission: mission
      ? `class ${LESSONS.indexOf(mission) + 1} "${mission.title}": ${mission.mission.steps
          .map((s) => `${s.text} (${checks.has(s.check) ? 'done' : 'to do'})`)
          .join(', ')}`
      : '',
    demos: episodes.length,
    brains: skills.length,
    lastMessage: notice?.text ?? '',
  };

  const setTab = (t: TabId) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* fine */
    }
  };

  const setEpisodes = (e: Episode[]) => {
    setEpisodesState(e);
    if (!storage.saveEpisodes(e)) {
      setNotice({ kind: 'warn', text: 'This browser is out of space for demos. Delete a few old ones, or download them.' });
    }
  };
  const setSkills = (s: SavedPolicy[]) => {
    setSkillsState(s);
    storage.saveSkills(s);
  };

  // Escape is a keyboard STOP, anywhere on the page. Capture phase, so widgets that
  // swallow Escape (Blockly's keyboard navigation, dialogs) can never block it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [robot.stop]);

  useEffect(() => {
    if (!notice || notice.kind === 'warn') return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  const calibrating = (['leader', 'follower'] as ArmRole[]).find((r) => robot.slots[r].status === 'needs-calibration');
  const moving = telemetry.mode !== 'idle';

  const [menuOpen, setMenuOpen] = useState(false);
  const openAcademy = () => {
    setAcademyStart(null);
    setAcademyOpen(true);
    setMenuOpen(false);
  };
  const MAIN_IDS: string[] = ['drive', 'code', 'teach', 'run'];
  const MAIN = TABS.filter((t) => MAIN_IDS.includes(t.id));
  const MORE = TABS.filter((t) => !MAIN_IDS.includes(t.id));
  const [sheetOpen, setSheetOpen] = useState(false);
  const pick = (t: TabId) => {
    if (t === tab && sheetOpen) setSheetOpen(false);
    else {
      setTab(t);
      setSheetOpen(true);
    }
    setMenuOpen(false);
  };

  return (
    <div className="app simple">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="sim-full">
        <Stage robot={robot} highlight={highlight} confirm={confirm} />
      </div>

      <header className="s-top">
        <span className="s-brand">🦾 GRIP</span>
        <p className={`status ${moving ? 'moving' : ''}`} role="status" aria-live="polite">
          <span className="status-dot" aria-hidden="true" />
          {MODE_TEXT[telemetry.mode]}
          {telemetry.recording && ' · ⏺'}
        </p>
        <span className="s-spacer" />
        <div className="s-menu-wrap">
          <button className="s-round" aria-expanded={menuOpen} aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}>
            ☰
          </button>
          {menuOpen && (
            <div className="s-menu" role="menu">
              {MORE.map((t) => (
                <button key={t.id} role="menuitem" onClick={() => pick(t.id)}>
                  {t.icon} {t.label}
                </button>
              ))}
              <button role="menuitem" onClick={openAcademy}>
                🎓 Teach me
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setCallOpen(true);
                  setMenuOpen(false);
                }}
              >
                📹 Live class
              </button>
            </div>
          )}
        </div>
        <button className="stop" onClick={stop} aria-keyshortcuts="Escape" title="Stop everything (Esc)">
          ✋ STOP
        </button>
      </header>

      {mission && (
        <div className="s-banner">
          <MissionBanner
            lesson={mission}
            checks={checks}
            complete={missionComplete}
            onOpenAcademy={openAcademy}
            onNext={
              nextLesson
                ? () => {
                    setAcademyStart(nextLesson.id);
                    setAcademyOpen(true);
                  }
                : null
            }
            onClose={() => setLearn({ ...learn, active: null })}
          />
        </div>
      )}

      {notice && (
        <div className={`notice s-notice ${notice.kind}`} role={notice.kind === 'warn' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          <button className="btn link" onClick={() => setNotice(null)} aria-label="Close message">
            ✕
          </button>
        </div>
      )}

      {sheetOpen && (
        <main id="main" className={`s-sheet ${tab === 'code' ? 'wide' : ''}`}>
          <button className="s-close" onClick={() => setSheetOpen(false)} aria-label="Close panel">
            ✕
          </button>
          {calibrating && robot.slots[calibrating].bus ? (
            <CalibrationWizard
              key={calibrating}
              role={calibrating}
              bus={robot.slots[calibrating].bus!}
              onDone={(cal) => robot.finishCalibration(calibrating, cal)}
              onCancel={() => robot.disconnect(calibrating)}
            />
          ) : (
            <>
              {tab === 'connect' && <ConnectPanel robot={robot} confirm={confirm} />}
              {tab === 'drive' && <DrivePanel robot={robot} confirm={confirm} onHighlight={setHighlight} />}
              {tab === 'code' && (
                <Suspense fallback={<p className="hint">Loading blocks…</p>}>
                  <CodePanel robot={robot} skills={skills} confirm={confirm} />
                </Suspense>
              )}
              {tab === 'teach' && (
                <>
                  <TeachPanel robot={robot} episodes={episodes} setEpisodes={setEpisodes} confirm={confirm} />
                  <SimLeaderSliders robot={robot} />
                </>
              )}
              {tab === 'train' && <TrainPanel robot={robot} episodes={episodes} skills={skills} setSkills={setSkills} confirm={confirm} />}
              {tab === 'run' && <RunPanel robot={robot} skills={skills} confirm={confirm} />}
              {tab === 'settings' && (
                <SettingsPanel
                  robot={robot}
                  episodes={episodes}
                  setEpisodes={setEpisodes}
                  skills={skills}
                  setSkills={setSkills}
                  confirm={confirm}
                />
              )}
              {tab === 'connect' && <SimLeaderSliders robot={robot} />}
            </>
          )}
        </main>
      )}

      <nav className="s-dock" aria-label="Sections">
        {MAIN.map((t) => (
          <button key={t.id} className={tab === t.id && sheetOpen ? 'active' : ''} onClick={() => pick(t.id)}>
            <span aria-hidden="true">{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>
      {dialog}
      {academyOpen && (
        <Academy
          progress={learn}
          setProgress={setLearn}
          startWith={academyStart}
          onClose={() => setAcademyOpen(false)}
          onStartMission={startMission}
          onJoinCall={() => {
            setAcademyOpen(false);
            setCallOpen(true);
          }}
        />
      )}
      {callOpen && <TeacherCall context={teacherContext} onLeave={() => setCallOpen(false)} />}
    </div>
  );
}

function Stage({
  robot,
  highlight,
  confirm,
}: {
  robot: Robot;
  highlight: number | null;
  confirm: (t: string, b: string) => Promise<boolean>;
}) {
  const { telemetry, controller, slots, motorsOn } = robot;
  const arm = slots.follower.arm;
  const live = slots.follower.status === 'ready' && motorsOn && !!arm && !!telemetry.follower;
  const isReal = slots.follower.bus?.kind === 'serial';
  const okayed = useRef(!isReal);
  const goal = useRef<Joints | null>(null);
  const [used, setUsed] = useState(false);

  const interact = live
    ? {
        onGrab: () => {
          if (!okayed.current) {
            void confirm('Move the real arm?', 'Keep hands clear of the joints. STOP is always at the top.').then((ok) => {
              okayed.current = ok;
            });
            return false;
          }
          goal.current = telemetry.mode === 'drive' ? goal.current ?? telemetry.follower : telemetry.follower;
          return true;
        },
        onDrag: (p: [number, number, number]) => {
          const base = goal.current ?? telemetry.follower!;
          const next = clampTarget(solveTip(p, base), arm!.limits, telemetry.follower!);
          goal.current = next;
          setUsed(true);
          try {
            controller.drive(next);
          } catch (e) {
            robot.setNotice({ kind: 'warn', text: (e as Error).message });
          }
        },
        onTap: () => {
          const base = [...(goal.current ?? telemetry.follower!)] as Joints;
          base[GRIPPER] = base[GRIPPER] > 50 ? 0 : 100;
          goal.current = base;
          setUsed(true);
          try {
            controller.drive(clampTarget(base, arm!.limits, telemetry.follower!));
          } catch (e) {
            robot.setNotice({ kind: 'warn', text: (e as Error).message });
          }
        },
      }
    : undefined;

  return (
    <div className="preview">
      <ArmPreview
        follower={telemetry.follower}
        leader={telemetry.leader}
        target={telemetry.target}
        highlight={highlight}
        interact={interact}
      />
      {!telemetry.follower && (
        <div className="preview-empty">
          <button className="btn primary big" onClick={() => robot.startPretendFollower()}>
            ▶ Start the pretend arm
          </button>
        </div>
      )}
      {live && !used && <p className="s-hint">👆 Drag the glowing ball to move the arm. Tap it to open or close the hand.</p>}
      {telemetry.mode !== 'idle' && telemetry.progress > 0 && (
        <progress className="stage-progress" max={1} value={telemetry.progress} aria-label="Progress" />
      )}
    </div>
  );
}
