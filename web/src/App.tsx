import { Suspense, lazy, useEffect, useState } from 'react';
import { Episode } from './ai/episodes';
import { SavedPolicy } from './ai/policy';
import { ArmRole } from './arm/arm';
import { Mode } from './control/controller';
import { storage } from './storage';
import { ArmPreview } from './ui/ArmPreview';
import { CalibrationWizard } from './ui/CalibrationWizard';
import { CameraView } from './ui/CameraView';
import { ConnectPanel, SimLeaderSliders } from './ui/ConnectPanel';
import { DrivePanel } from './ui/DrivePanel';
import { TeachPanel } from './ui/TeachPanel';
import { RunPanel, TrainPanel } from './ui/TrainPanel';
import { JointReadout, useConfirm } from './ui/common';
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

  // Escape is a keyboard STOP, anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') robot.stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [robot.stop]);

  useEffect(() => {
    if (!notice || notice.kind === 'warn') return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  const calibrating = (['leader', 'follower'] as ArmRole[]).find((r) => robot.slots[r].status === 'needs-calibration');
  const moving = telemetry.mode !== 'idle';

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            🦾
          </span>
          <div>
            <h1>GRIP AI Arm</h1>
            <p className="tagline">Code it. Teach it. Train it.</p>
          </div>
        </div>
        <ArmChips robot={robot} onClick={() => setTab('connect')} />
        <p className={`status ${moving ? 'moving' : ''}`} role="status" aria-live="polite">
          <span className="status-dot" aria-hidden="true" />
          {MODE_TEXT[telemetry.mode]}
          {telemetry.recording && ' · ⏺ rec'}
        </p>
        <button className="stop" onClick={robot.stop} aria-keyshortcuts="Escape" title="Stop everything (Esc)">
          <span aria-hidden="true">✋</span> STOP
        </button>
      </header>

      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon" aria-hidden="true">
              {t.icon}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {notice && (
        <div className={`notice ${notice.kind}`} role={notice.kind === 'warn' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          <button className="btn link" onClick={() => setNotice(null)} aria-label="Close message">
            ✕
          </button>
        </div>
      )}

      <main id="main" className={`layout ${tab === 'code' ? 'wide' : ''}`}>
        <div className="main-col">
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
                <TeachPanel robot={robot} episodes={episodes} setEpisodes={setEpisodes} confirm={confirm} />
              )}
              {tab === 'train' && <TrainPanel robot={robot} episodes={episodes} skills={skills} setSkills={setSkills} />}
              {tab === 'run' && <RunPanel robot={robot} skills={skills} confirm={confirm} />}
            </>
          )}
        </div>
        <aside className="side-col" aria-label="Live view of the arm">
          <Stage robot={robot} highlight={highlight} />
          <CameraView />
          {(tab === 'teach' || tab === 'connect') && <SimLeaderSliders robot={robot} />}
        </aside>
      </main>
      {dialog}
    </div>
  );
}

function ArmChips({ robot, onClick }: { robot: Robot; onClick: () => void }) {
  const chip = (role: ArmRole) => {
    const slot = robot.slots[role];
    const name = role === 'leader' ? '🎮 Leader' : '🤖 Follower';
    let state = 'not connected';
    let cls = 'off';
    if (slot.status === 'connecting') [state, cls] = ['connecting…', 'busy'];
    else if (slot.status === 'needs-calibration') [state, cls] = ['needs calibration', 'busy'];
    else if (slot.status === 'ready') {
      const kind = slot.bus?.kind === 'sim' ? 'pretend' : 'real';
      if (role === 'follower') [state, cls] = [`${kind} · motors ${robot.motorsOn ? 'on' : 'off'}`, robot.motorsOn ? 'on' : 'busy'];
      else [state, cls] = [kind, 'on'];
    }
    return (
      <button key={role} className={`chip ${cls}`} onClick={onClick} title="Open the Connect tab">
        <span className="chip-dot" aria-hidden="true" />
        <span className="chip-name">{name}</span>
        <span className="chip-state">{state}</span>
      </button>
    );
  };
  return (
    <div className="chips" aria-label="Arm connections">
      {chip('leader')}
      {chip('follower')}
    </div>
  );
}

function Stage({ robot, highlight }: { robot: Robot; highlight: number | null }) {
  const { telemetry } = robot;
  const [resetKey, setResetKey] = useState(0);
  const [details, setDetails] = useState(false);
  return (
    <div className="stage">
      <div className="preview">
        <ArmPreview
          follower={telemetry.follower}
          leader={telemetry.leader}
          target={telemetry.target}
          highlight={highlight}
          resetKey={resetKey}
        />
        {!telemetry.follower && (
          <div className="preview-empty">
            <p>Connect a follower arm to see it here.</p>
            <button className="btn" onClick={() => robot.startPretendFollower()}>
              🧪 Use a pretend arm
            </button>
          </div>
        )}
        {telemetry.mode !== 'idle' && telemetry.progress > 0 && (
          <progress className="stage-progress" max={1} value={telemetry.progress} aria-label="Progress" />
        )}
        <div className="preview-legend" aria-hidden="true">
          <span>
            <i className="swatch follower" /> Follower
          </span>
          {telemetry.target && (
            <span>
              <i className="swatch target" /> Going to
            </span>
          )}
          {telemetry.leader && (
            <span>
              <i className="swatch leader" /> Leader
            </span>
          )}
        </div>
        <button className="btn small reset-view" onClick={() => setResetKey((k) => k + 1)} aria-label="Reset the 3D view">
          ⟲
        </button>
      </div>
      <button className="btn link" aria-expanded={details} onClick={() => setDetails((d) => !d)}>
        {details ? 'Hide' : 'Show'} joint numbers
      </button>
      {details && (
        <>
          <div className="grid2">
            <JointReadout title="🎮 Leader" joints={telemetry.leader} />
            <JointReadout title="🤖 Follower" joints={telemetry.follower} />
          </div>
          {(telemetry.leader || telemetry.follower) && (
            <p className="hint">Updating {Math.round(telemetry.hz)} times a second</p>
          )}
        </>
      )}
    </div>
  );
}
