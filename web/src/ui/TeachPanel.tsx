import { useState } from 'react';
import { Episode, FPS, episodeDuration, toLeRobotRows } from '../ai/episodes';
import { JOINTS } from '../arm/joints';
import { SPEEDS, SpeedName } from '../arm/safety';
import { downloadJson } from '../storage';
import { Robot } from './useRobot';

export function TeachPanel({
  robot,
  episodes,
  setEpisodes,
  confirm,
}: {
  robot: Robot;
  episodes: Episode[];
  setEpisodes: (e: Episode[]) => void;
  confirm: (t: string, b: string) => Promise<boolean>;
}) {
  const { controller, telemetry, slots, motorsOn } = robot;
  const [task, setTask] = useState('wave hello');
  const [speed, setSpeed] = useState<SpeedName>(controller.speed);
  const ready = slots.leader.status === 'ready' && slots.follower.status === 'ready' && motorsOn;
  const real = slots.follower.bus?.kind === 'serial';
  const copying = telemetry.mode === 'teleop';
  const cleanTask = task.trim().slice(0, 40) || 'my skill';

  const guard = async (fn: () => void) => {
    if (real && !(await confirm('Ready to move the real arm?', 'Clear the table around the follower. Press the big STOP button any time.'))) return;
    try {
      fn();
    } catch (e) {
      robot.setNotice({ kind: 'warn', text: (e as Error).message });
    }
  };

  const changeSpeed = (s: SpeedName) => {
    setSpeed(s);
    controller.speed = s;
  };

  const save = () => {
    const ep = controller.finishRecording(cleanTask);
    if (!ep) {
      robot.setNotice({ kind: 'info', text: 'That one was too short to keep. Try a slightly longer move!' });
      return;
    }
    setEpisodes([...episodes, ep]);
    robot.setNotice({ kind: 'success', text: `Saved demo #${episodes.length + 1}! 🎉` });
  };

  const sameTask = episodes.filter((e) => e.task === cleanTask).length;

  return (
    <section aria-labelledby="teach-title">
      <h2 id="teach-title">2. Teach by showing</h2>
      <p>
        Move the <strong>leader</strong> arm and the <strong>follower</strong> copies you. Record a few demos of the same
        task so the robot brain can learn it.
      </p>
      {!ready && <p className="callout">Connect both arms and turn on the follower motors first.</p>}

      <div className="card">
        <div className="row">
          {!copying ? (
            <button className="btn primary big" disabled={!ready} onClick={() => guard(() => controller.startTeleop())}>
              🪞 Start "Copy me"
            </button>
          ) : (
            <button className="btn big" onClick={robot.stop}>
              ⏸ Stop copying
            </button>
          )}
          <fieldset className="speed">
            <legend>Speed limit</legend>
            {(Object.keys(SPEEDS) as SpeedName[]).map((s) => (
              <label key={s}>
                <input type="radio" name="speed" checked={speed === s} onChange={() => changeSpeed(s)} />
                {s === 'slow' ? '🐢' : s === 'medium' ? '🐇' : '🚀'} <span className="cap">{s}</span>
              </label>
            ))}
          </fieldset>
        </div>
      </div>

      <div className="card">
        <h3>🎬 Record a demo</h3>
        <label className="field">
          What are you teaching?
          <input value={task} maxLength={40} onChange={(e) => setTask(e.target.value)} disabled={telemetry.recording} />
        </label>
        <p className="hint">
          Tip: start from the same spot every time, move slowly and smoothly. You have {sameTask} demo
          {sameTask === 1 ? '' : 's'} for "{cleanTask}". Try for 5 or more!
        </p>
        <div className="row">
          {!telemetry.recording ? (
            <button className="btn record big" disabled={!copying} onClick={() => controller.startRecording()}>
              ⏺ Record
            </button>
          ) : (
            <>
              <span className="rec-indicator" role="status">
                <span className="dot" aria-hidden="true" /> Recording… {(telemetry.recordedFrames / FPS).toFixed(1)} s
              </span>
              <button className="btn primary big" onClick={save}>
                💾 Save
              </button>
              <button className="btn" onClick={() => controller.cancelRecording()}>
                🗑 Throw away
              </button>
            </>
          )}
        </div>
        {!copying && <p className="hint">Start "Copy me" to record.</p>}
      </div>

      {copying && <HandStatus robot={robot} />}
      {copying && <CopyCheck robot={robot} />}

      <EpisodeList robot={robot} episodes={episodes} setEpisodes={setEpisodes} guard={guard} />
    </section>
  );
}

function EpisodeList({
  robot,
  episodes,
  setEpisodes,
  guard,
}: {
  robot: Robot;
  episodes: Episode[];
  setEpisodes: (e: Episode[]) => void;
  guard: (fn: () => void) => Promise<void>;
}) {
  const busy = robot.telemetry.mode !== 'idle';
  const canMove = robot.slots.follower.status === 'ready' && robot.motorsOn;
  if (!episodes.length) return <p className="hint">Your saved demos will show up here.</p>;
  return (
    <div className="card">
      <div className="row spread">
        <h3>📚 My demos ({episodes.length})</h3>
        <button
          className="btn link"
          onClick={() => downloadJson('grip-demos-lerobot.json', toLeRobotRows(episodes))}
          title="Downloads the demos as LeRobot-style rows (observation.state, action) to train bigger AI models"
        >
          ⬇️ Download data
        </button>
      </div>
      <ul className="episodes">
        {episodes.map((e, i) => (
          <li key={e.id}>
            <span>
              #{i + 1} <strong>{e.task}</strong> · {episodeDuration(e).toFixed(1)} s
            </span>
            <span className="row">
              <button className="btn small" disabled={busy || !canMove} onClick={() => guard(() => robot.controller.startReplay(e))}>
                ▶️ Replay
              </button>
              <button
                className="btn small"
                aria-label={`Delete demo ${i + 1}`}
                onClick={() => setEpisodes(episodes.filter((x) => x.id !== e.id))}
              >
                🗑
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Live "is it copying?" check: leader -> what we told the follower -> where the follower really is. */
function CopyCheck({ robot }: { robot: Robot }) {
  const { leader, goal, follower } = robot.telemetry;
  const fmt = (v: number | undefined, unit: string) => (v === undefined ? '–' : `${Math.round(v)}${unit}`);
  return (
    <details className="card copy-check">
      <summary>🔍 Is it copying? (live numbers)</summary>
      <p className="hint">
        If "Told to go" changes but "Follower" doesn't, the follower is getting the message but its motor isn't moving.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Joint</th>
            <th scope="col">🎮 Leader</th>
            <th scope="col">➡️ Told to go</th>
            <th scope="col">🤖 Follower</th>
          </tr>
        </thead>
        <tbody>
          {JOINTS.map((j, i) => {
            const lag = goal && follower ? Math.abs(goal[i] - follower[i]) : 0;
            return (
              <tr key={j.id}>
                <th scope="row">
                  <span aria-hidden="true">{j.icon}</span> {j.name}
                </th>
                <td>{fmt(leader?.[i], j.unit)}</td>
                <td>{fmt(goal?.[i], j.unit)}</td>
                <td className={lag > 15 ? 'lagging' : ''}>
                  {fmt(follower?.[i], j.unit)}
                  {lag > 15 && <span className="sr-only"> (behind)</span>}
                  {lag > 15 && <span aria-hidden="true"> ⚠️</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}

/** Is the follower's hand copying the leader's thumb yet? Also flags old hand settings. */
function HandStatus({ robot }: { robot: Robot }) {
  const following = robot.telemetry.handFollowing;
  const stale = (['leader', 'follower'] as const).filter((r) => {
    const cal = robot.slots[r].arm?.calibration;
    return robot.slots[r].bus?.kind === 'serial' && cal && !cal.handMeasured;
  });
  return (
    <div className={`card hand-status ${following ? 'on' : ''}`} role="status">
      <strong>✋ Hand:</strong>{' '}
      {following ? 'copying your thumb (squeeze = close, let go = open)' : "waiting. Squeeze the leader's thumb to take control."}
      <div className="row hand-flip">
        <button
          className="btn small"
          aria-pressed={robot.handFlipped}
          onClick={() => robot.setHandFlipped(!robot.handFlipped)}
        >
          🔄 Hand goes the wrong way? Flip it
        </button>
        {robot.handFlipped && <span className="hint">Flipped (remembered on this computer)</span>}
      </div>
      {stale.length > 0 && (
        <p className="callout warn">
          The {stale.join(' and ')} arm{stale.length > 1 ? 's' : ''} {stale.length > 1 ? "don't" : "doesn't"} know which
          way {stale.length > 1 ? 'their hands' : 'its hand'} moves yet, so the hand may go the wrong way. On the Connect
          tab click <strong>Calibrate again</strong>, then <strong>⚡ Quick start (just the hand)</strong>.
        </p>
      )}
    </div>
  );
}
