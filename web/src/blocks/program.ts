import { GRIPPER, JOINTS, JointId, Joints } from '../arm/joints';
import { PoseName, POSES, isPoseName } from '../arm/poses';
import { Limits, SPEEDS, SpeedName } from '../arm/safety';

/**
 * Block programs are compiled into a small, safe, flat command list.
 * We never generate or eval JavaScript from blocks.
 *
 *   Blockly workspace -> Program (validated AST) -> Command[] -> ProgramRunner -> Arm (safety)
 */

export type Stmt =
  | { kind: 'move'; id: string; joint: JointId; value: number }
  | { kind: 'turn'; id: string; joint: JointId; by: number }
  | { kind: 'pose'; id: string; pose: PoseName }
  | { kind: 'grip'; id: string; percent: number }
  | { kind: 'speed'; id: string; speed: SpeedName }
  | { kind: 'wait'; id: string; seconds: number }
  | { kind: 'repeat'; id: string; times: number; body: Stmt[] }
  | { kind: 'forever'; id: string; body: Stmt[] }
  | { kind: 'skill'; id: string; task: string };

export interface Program {
  version: 1;
  body: Stmt[];
}

export type Command =
  | { op: 'move'; blockId: string; set: (number | null)[] }
  | { op: 'moveBy'; blockId: string; by: number[] }
  | { op: 'wait'; blockId: string; seconds: number }
  | { op: 'speed'; blockId: string; speed: SpeedName }
  | { op: 'skill'; blockId: string; task: string };

export interface CompileError {
  blockId: string;
  message: string;
}

export interface CompileResult {
  commands: Command[];
  errors: CompileError[];
  /** True when a "forever" loop was cut short at the safety cap. */
  truncated: boolean;
}

export const MAX_COMMANDS = 2000;
export const MAX_REPEAT = 50;
export const MAX_DEPTH = 8;
export const MAX_WAIT = 10;

const jointIndex = (id: JointId) => JOINTS.findIndex((j) => j.id === id);
const fmt = (v: number) => String(Math.round(v));

/** "Whoa, the elbow can't bend that far" style message, or null if OK. */
function rangeError(i: number, value: number, limits: Limits): string | null {
  const { min, max } = limits[i];
  if (!Number.isFinite(value)) return 'This block needs a number.';
  if (value >= min && value <= max) return null;
  const name = JOINTS[i].name.toLowerCase();
  if (i === GRIPPER) return `The hand opens from 0% to 100%. Try a number in between!`;
  return `Whoa, the ${name} can't go to ${fmt(value)}°. Try a number between ${fmt(min)} and ${fmt(max)}!`;
}

export function compile(program: Program, limits: Limits, skills: string[] = []): CompileResult {
  const commands: Command[] = [];
  const errors: CompileError[] = [];
  let truncated = false;

  const err = (blockId: string, message: string) => {
    if (!errors.some((e) => e.blockId === blockId)) errors.push({ blockId, message });
  };

  // First pass: validate every block once (not once per loop iteration).
  const validate = (body: Stmt[], depth: number) => {
    if (depth > MAX_DEPTH) {
      if (body[0]) err(body[0].id, `That's a lot of loops inside loops! Try using fewer than ${MAX_DEPTH}.`);
      return;
    }
    for (const s of body) {
      switch (s.kind) {
        case 'move': {
          const i = jointIndex(s.joint);
          if (i < 0 || i === GRIPPER) err(s.id, 'Pick a joint to move.');
          else {
            const e = rangeError(i, s.value, limits);
            if (e) err(s.id, e);
          }
          break;
        }
        case 'turn': {
          const i = jointIndex(s.joint);
          if (i < 0 || i === GRIPPER) err(s.id, 'Pick a joint to turn.');
          else if (!Number.isFinite(s.by) || Math.abs(s.by) > 360) err(s.id, 'Try turning by a number between -360 and 360.');
          break;
        }
        case 'pose':
          if (!isPoseName(s.pose)) err(s.id, 'Pick a pose from the list.');
          break;
        case 'grip': {
          const e = rangeError(GRIPPER, s.percent, limits);
          if (e) err(s.id, e);
          break;
        }
        case 'speed':
          if (!(s.speed in SPEEDS)) err(s.id, 'Pick a speed.');
          break;
        case 'wait':
          if (!Number.isFinite(s.seconds) || s.seconds < 0 || s.seconds > MAX_WAIT) {
            err(s.id, `Wait between 0 and ${MAX_WAIT} seconds.`);
          }
          break;
        case 'repeat':
          if (!Number.isInteger(s.times) || s.times < 1 || s.times > MAX_REPEAT) {
            err(s.id, `Repeat between 1 and ${MAX_REPEAT} times.`);
          }
          validate(s.body, depth + 1);
          break;
        case 'forever':
          if (!s.body.length) err(s.id, 'Put some blocks inside "forever" first.');
          validate(s.body, depth + 1);
          break;
        case 'skill':
          if (!skills.includes(s.task)) err(s.id, 'Train this skill first (in the Train step), then pick it here.');
          break;
        default:
          err((s as Stmt).id ?? '', 'This block is not ready yet.');
      }
    }
  };
  validate(program.body, 0);
  if (errors.length) return { commands: [], errors, truncated };

  // Second pass: expand into a flat command list, with a hard cap.
  const full = () => commands.length >= MAX_COMMANDS;
  const emit = (body: Stmt[]): void => {
    for (const s of body) {
      if (full()) {
        truncated = true;
        return;
      }
      switch (s.kind) {
        case 'move': {
          const set: (number | null)[] = new Array(6).fill(null);
          set[jointIndex(s.joint)] = s.value;
          commands.push({ op: 'move', blockId: s.id, set });
          break;
        }
        case 'turn': {
          const by = new Array(6).fill(0);
          by[jointIndex(s.joint)] = s.by;
          commands.push({ op: 'moveBy', blockId: s.id, by });
          break;
        }
        case 'pose':
          commands.push({ op: 'move', blockId: s.id, set: [...POSES[s.pose].joints] });
          break;
        case 'grip': {
          const set: (number | null)[] = new Array(6).fill(null);
          set[GRIPPER] = s.percent;
          commands.push({ op: 'move', blockId: s.id, set });
          break;
        }
        case 'speed':
          commands.push({ op: 'speed', blockId: s.id, speed: s.speed });
          break;
        case 'wait':
          commands.push({ op: 'wait', blockId: s.id, seconds: s.seconds });
          break;
        case 'repeat':
          for (let k = 0; k < s.times && !full(); k++) emit(s.body);
          if (full()) truncated = true;
          break;
        case 'forever':
          // "Forever" really means "until STOP or the safety cap".
          while (!full()) {
            const before = commands.length;
            emit(s.body);
            if (commands.length === before) break;
          }
          truncated = true;
          return;
        case 'skill':
          commands.push({ op: 'skill', blockId: s.id, task: s.task });
          break;
      }
    }
  };
  emit(program.body);
  return { commands, errors, truncated };
}

/** "Show me the code": a readable Python-style version for older learners. */
export function toPython(program: Program): string {
  const lines = ['# Made with GRIP blocks', 'from grip import arm', ''];
  const write = (body: Stmt[], indent: string) => {
    if (!body.length) lines.push(`${indent}pass`);
    for (const s of body) {
      switch (s.kind) {
        case 'move':
          lines.push(`${indent}arm.move("${s.joint}", to=${s.value})`);
          break;
        case 'turn':
          lines.push(`${indent}arm.turn("${s.joint}", by=${s.by})`);
          break;
        case 'pose':
          lines.push(`${indent}arm.pose("${s.pose}")`);
          break;
        case 'grip':
          lines.push(`${indent}arm.hand(${s.percent})  # % open`);
          break;
        case 'speed':
          lines.push(`${indent}arm.speed("${s.speed}")`);
          break;
        case 'wait':
          lines.push(`${indent}arm.wait(${s.seconds})`);
          break;
        case 'repeat':
          lines.push(`${indent}for _ in range(${s.times}):`);
          write(s.body, indent + '    ');
          break;
        case 'forever':
          lines.push(`${indent}while True:`);
          write(s.body, indent + '    ');
          break;
        case 'skill':
          lines.push(`${indent}arm.run_skill("${s.task}")`);
          break;
      }
    }
  };
  write(program.body, '');
  return lines.join('\n');
}

/** Start pose for a joints target. Exported for tests. */
export function applySet(base: Joints, set: (number | null)[]): Joints {
  return base.map((v, i) => set[i] ?? v) as Joints;
}
