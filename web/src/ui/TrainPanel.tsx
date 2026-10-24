import { useRef, useState } from 'react';
import { Episode } from '../ai/episodes';
import { SavedPolicy, Skill, trainPolicy } from '../ai/policy';
import { LossChart } from './common';
import { Robot } from './useRobot';

const EFFORT = {
  quick: { steps: 800, label: '⚡ Quick (a few seconds)' },
  better: { steps: 3000, label: '🧠 Better' },
  best: { steps: 8000, label: '🏆 Best (takes longer)' },
} as const;
type Effort = keyof typeof EFFORT;

export function TrainPanel({
  robot,
  episodes,
  skills,
  setSkills,
}: {
  robot: Robot;
  episodes: Episode[];
  skills: SavedPolicy[];
  setSkills: (s: SavedPolicy[]) => void;
}) {
  const tasks = [...new Set(episodes.map((e) => e.task))];
  const [task, setTask] = useState(tasks[0] ?? '');
  const [effort, setEffort] = useState<Effort>('quick');
  const [points, setPoints] = useState<{ step: number; loss: number }[]>([]);
  const [training, setTraining] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const chosen = tasks.includes(task) ? task : tasks[0] ?? '';
  const demos = episodes.filter((e) => e.task === chosen);

  const train = async () => {
    abort.current = new AbortController();
    setTraining(true);
    setPoints([]);
    try {
      const saved = await trainPolicy(demos, {
        name: `${chosen} brain`,
        task: chosen,
        steps: EFFORT[effort].steps,
        signal: abort.current.signal,
        onProgress: (p) => setPoints((pts) => [...pts, { step: p.step, loss: p.loss }]),
      });
      if (saved.steps === 0) return;
      setSkills([...skills.filter((s) => s.task !== chosen), saved]);
      robot.setNotice({ kind: 'success', text: `The robot brain learned "${chosen}"! Go to step 4 to test it. 🎉` });
    } catch (e) {
      robot.setNotice({ kind: 'warn', text: (e as Error).message });
    } finally {
      setTraining(false);
    }
  };

  return (
    <section aria-labelledby="train-title">
      <h2 id="train-title">3. Train the robot brain</h2>
      <p>
        The brain looks at your demos and practices guessing <em>"where should the arm go next?"</em> Each practice round
        it makes mistakes, then fixes them a tiny bit.
      </p>
      {!tasks.length ? (
        <p className="callout">Record some demos in step 2 first. 3 to 10 demos of the same task works well.</p>
      ) : (
        <div className="card">
          <div className="row">
            <label className="field">
              Task to learn
              <select value={chosen} onChange={(e) => setTask(e.target.value)} disabled={training}>
                {tasks.map((t) => (
                  <option key={t} value={t}>
                    {t} ({episodes.filter((e) => e.task === t).length} demos)
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="speed">
              <legend>How hard to practice</legend>
              {(Object.keys(EFFORT) as Effort[]).map((k) => (
                <label key={k}>
                  <input type="radio" name="effort" checked={effort === k} onChange={() => setEffort(k)} disabled={training} />
                  {EFFORT[k].label}
                </label>
              ))}
            </fieldset>
          </div>
          {demos.length < 3 && (
            <p className="hint">Only {demos.length} demo{demos.length === 1 ? '' : 's'}. More demos = a smarter brain!</p>
          )}
          <div className="row">
            {!training ? (
              <button className="btn primary big" onClick={train}>
                🧠 Start learning
              </button>
            ) : (
              <button className="btn big" onClick={() => abort.current?.abort()}>
                ⏹ Stop learning
              </button>
            )}
            {training && points.length > 0 && (
              <span role="status">
                Practice round {points[points.length - 1].step} of {EFFORT[effort].steps}
              </span>
            )}
          </div>
          <LossChart points={points} />
          <details>
            <summary>How does it work? (for curious minds)</summary>
            <p>
              This is <strong>imitation learning</strong> (also called behaviour cloning). A small neural network gets
              the follower's 6 joint angles plus "how far through the task are we" and predicts the next 6 joint
              targets. We add a little random wobble to the inputs while training, so the brain also learns how to get
              back on track after small mistakes.
            </p>
            <p>
              The "mistakes" number is the mean squared error. Big robots use the same idea with cameras and bigger
              networks, like the ACT policy in LeRobot. Use "Download data" in step 2 to try that later!
            </p>
          </details>
        </div>
      )}
      {skills.length > 0 && (
        <div className="card">
          <h3>🧠 My trained brains</h3>
          <ul className="episodes">
            {skills.map((s) => (
              <li key={s.createdAt}>
                <span>
                  <strong>{s.task}</strong> · learned from {s.episodes} demos · mistakes {s.finalLoss.toFixed(3)}
                </span>
                <button className="btn small" aria-label={`Delete ${s.task} brain`} onClick={() => setSkills(skills.filter((x) => x !== s))}>
                  🗑
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function RunPanel({
  robot,
  skills,
  confirm,
}: {
  robot: Robot;
  skills: SavedPolicy[];
  confirm: (t: string, b: string) => Promise<boolean>;
}) {
  const [chosen, setChosen] = useState(0);
  const [trials, setTrials] = useState<boolean[]>([]);
  const { telemetry, slots, motorsOn } = robot;
  const ready = slots.follower.status === 'ready' && motorsOn;
  const saved = skills[Math.min(chosen, skills.length - 1)];
  const running = telemetry.mode === 'skill';

  const run = async () => {
    if (!saved) return;
    if (
      slots.follower.bus?.kind === 'serial' &&
      !(await confirm('Let the robot brain drive?', 'AI can make mistakes. Keep your hand near STOP and the table clear.'))
    ) {
      return;
    }
    try {
      robot.controller.startSkill(new Skill(saved));
    } catch (e) {
      robot.setNotice({ kind: 'warn', text: (e as Error).message });
    }
  };

  const wins = trials.filter(Boolean).length;

  return (
    <section aria-labelledby="run-title">
      <h2 id="run-title">4. Let the robot try by itself</h2>
      {!skills.length ? (
        <p className="callout">Train a robot brain in step 3 first.</p>
      ) : (
        <>
          <div className="card">
            <p>
              Put the follower near where your demos started. Then press Go! The leader arm is <em>not</em> used here,
              the brain is in charge.
            </p>
            <div className="row">
              <label className="field">
                Brain
                <select value={chosen} onChange={(e) => setChosen(Number(e.target.value))} disabled={running}>
                  {skills.map((s, i) => (
                    <option key={s.createdAt} value={i}>
                      {s.task}
                    </option>
                  ))}
                </select>
              </label>
              {!running ? (
                <button className="btn primary big" disabled={!ready} onClick={run}>
                  🚀 Go!
                </button>
              ) : (
                <span role="status">Running… {Math.round(telemetry.progress * 100)}%</span>
              )}
            </div>
            {running && <progress max={1} value={telemetry.progress} aria-label="Skill progress" />}
            {!ready && <p className="hint">Connect the follower and turn on its motors.</p>}
          </div>
          <div className="card">
            <h3>🔬 Be a scientist: test it 10 times</h3>
            <p className="hint">After each try, tell us if it worked. Then change one thing (more demos?) and test again.</p>
            <div className="row">
              <button className="btn" disabled={trials.length >= 10} onClick={() => setTrials([...trials, true])}>
                👍 It worked
              </button>
              <button className="btn" disabled={trials.length >= 10} onClick={() => setTrials([...trials, false])}>
                👎 Not yet
              </button>
              <button className="btn link" onClick={() => setTrials([])}>
                Reset
              </button>
            </div>
            <p role="status">
              {trials.length
                ? `${wins} out of ${trials.length} tries worked (${Math.round((wins / trials.length) * 100)}% success rate)`
                : 'No tries yet.'}
            </p>
            <ol className="trials" aria-label="Trial results">
              {trials.map((ok, i) => (
                <li key={i}>{ok ? '✅ worked' : '🔁 not yet'}</li>
              ))}
            </ol>
          </div>
        </>
      )}
    </section>
  );
}
