import * as Blockly from 'blockly/core';
import * as En from 'blockly/msg/en';
import { useEffect, useRef, useState } from 'react';
import { Skill, SavedPolicy } from '../ai/policy';
import { STARTERS, TOOLBOX, defineBlocks, makeTheme, setSkillNames, workspaceToProgram } from '../blocks/blocklyDefs';
import { compile, toPython } from '../blocks/program';
import { ProgramRunner } from '../blocks/runner';
import { Robot } from './useRobot';

const SAVE_KEY = 'grip.blocks.v1';

Blockly.setLocale(En as unknown as Record<string, string>);

function loadSaved(): object | null {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export default function CodePanel({
  robot,
  skills,
  confirm,
}: {
  robot: Robot;
  skills: SavedPolicy[];
  confirm: (t: string, b: string) => Promise<boolean>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const ws = useRef<Blockly.WorkspaceSvg | null>(null);
  const warned = useRef<Blockly.Block[]>([]);
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [hint, setHint] = useState(STARTERS.wave.hint);
  const [blockSize, setBlockSize] = useState(1);
  const { telemetry, slots, motorsOn } = robot;
  const running = telemetry.mode === 'program';
  const followerReady = slots.follower.status === 'ready' && motorsOn;
  const isReal = slots.follower.bus?.kind === 'serial';

  setSkillNames(skills.map((s) => s.task));

  // Create the Blockly workspace once.
  useEffect(() => {
    if (!host.current) return;
    defineBlocks();
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const workspace = Blockly.inject(host.current, {
      toolbox: TOOLBOX,
      renderer: 'zelos',
      theme: makeTheme(dark),
      trashcan: true,
      sounds: false,
      zoom: { controls: true, wheel: false, startScale: 0.85, maxScale: 2, minScale: 0.4, pinch: true },
      move: { scrollbars: true, drag: true, wheel: true },
      grid: { spacing: 24, length: 2, colour: dark ? '#333044' : '#e3e0ef', snap: true },
    });
    ws.current = workspace;
    try {
      Blockly.serialization.workspaces.load(loadSaved() ?? STARTERS.wave.state, workspace);
    } catch {
      Blockly.serialization.workspaces.load(STARTERS.wave.state, workspace);
    }
    const update = (e: Blockly.Events.Abstract) => {
      if (e.isUiEvent) return;
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(Blockly.serialization.workspaces.save(workspace)));
      } catch {
        /* storage full or blocked: keep going */
      }
      setCode(toPython(workspaceToProgram(workspace).program));
    };
    workspace.addChangeListener(update);
    setCode(toPython(workspaceToProgram(workspace).program));

    const ro = new ResizeObserver(() => Blockly.svgResize(workspace));
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      workspace.dispose();
      ws.current = null;
    };
  }, []);

  // Light up the block that is running right now.
  useEffect(() => {
    ws.current?.highlightBlock(running ? telemetry.blockId : null);
  }, [running, telemetry.blockId]);

  useEffect(() => {
    ws.current?.setScale(0.85 * blockSize);
  }, [blockSize]);

  const clearWarnings = () => {
    warned.current.forEach((b) => !b.isDisposed() && b.setWarningText(null));
    warned.current = [];
  };

  const loadStarter = (key: keyof typeof STARTERS) => {
    const w = ws.current;
    if (!w) return;
    clearWarnings();
    Blockly.serialization.workspaces.load(STARTERS[key].state, w);
    setHint(STARTERS[key].hint);
  };

  const go = async () => {
    const w = ws.current;
    const follower = slots.follower.arm;
    if (!w || !follower) return;
    clearWarnings();
    const read = workspaceToProgram(w);
    const result = compile(read.program, follower.limits, skills.map((s) => s.task));
    const errors = [...read.errors, ...result.errors];
    if (errors.length) {
      for (const e of errors) {
        const block = e.blockId ? w.getBlockById(e.blockId) : null;
        if (block) {
          block.setWarningText(e.message);
          warned.current.push(block);
        }
      }
      const first = errors[0];
      if (first.blockId) w.centerOnBlock(first.blockId);
      robot.setNotice({ kind: 'warn', text: `Almost! ${first.message}` });
      return;
    }
    if (!result.commands.length) {
      robot.setNotice({ kind: 'info', text: 'Snap some blocks under "when ▶ Go is pressed" first.' });
      return;
    }
    if (isReal && !(await confirm('Run your program on the real arm?', 'Clear the space around the arm. STOP is always at the top.'))) {
      return;
    }
    const byTask = (task: string) => {
      const saved = skills.find((s) => s.task === task);
      return saved ? new Skill(saved) : null;
    };
    try {
      robot.controller.startProgram(new ProgramRunner(result.commands, follower.limits, byTask, robot.controller.speed));
    } catch (e) {
      robot.setNotice({ kind: 'warn', text: (e as Error).message });
    }
  };

  return (
    <section aria-labelledby="code-title" className="code-panel">
      <div className="panel-head">
        <h2 id="code-title">Code with blocks</h2>
        <p className="hint">Snap blocks together like puzzle pieces, then press Go. Your work saves by itself.</p>
      </div>

      <div className="code-toolbar" role="toolbar" aria-label="Program controls">
        {!running ? (
          <button className="btn go big" onClick={go} disabled={!followerReady}>
            <span aria-hidden="true">▶</span> Go
          </button>
        ) : (
          <button className="btn big" onClick={robot.stop}>
            ⏹ Stop program
          </button>
        )}
        {!followerReady && (
          <button className="btn" onClick={() => robot.startPretendFollower()}>
            🧪 Try it on a pretend arm
          </button>
        )}
        <label className="inline-field">
          Start from
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) loadStarter(e.target.value as keyof typeof STARTERS);
              e.target.value = '';
            }}
            disabled={running}
          >
            <option value="" disabled>
              a project…
            </option>
            {Object.entries(STARTERS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          Block size
          <input
            type="range"
            min={0.7}
            max={1.6}
            step={0.1}
            value={blockSize}
            onChange={(e) => setBlockSize(Number(e.target.value))}
            aria-valuetext={`${Math.round(blockSize * 100)} percent`}
          />
        </label>
        <button className="btn" aria-pressed={showCode} onClick={() => setShowCode((v) => !v)}>
          {'</>'} {showCode ? 'Hide code' : 'Show me the code'}
        </button>
      </div>

      <p className="callout tip">
        <span aria-hidden="true">💡</span> {hint}
      </p>

      <div className={`code-area ${showCode ? 'with-code' : ''}`}>
        <div
          ref={host}
          className="blockly-host"
          role="application"
          aria-label="Block coding area. Drag blocks from the categories on the left."
        />
        {showCode && (
          <pre className="code-view" aria-label="Your program as Python code" tabIndex={0}>
            <code>{code}</code>
          </pre>
        )}
      </div>
      {!followerReady && (
        <p className="hint">Connect the follower and turn its motors on (or use a pretend arm) to press Go.</p>
      )}
    </section>
  );
}
