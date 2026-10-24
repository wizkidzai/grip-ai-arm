import * as Blockly from 'blockly/core';
import { GRIPPER, JOINTS, JointId } from '../arm/joints';
import { POSES, PoseName } from '../arm/poses';
import { SpeedName } from '../arm/safety';
import { Program, Stmt } from './program';

/** Scratch-like category colours. */
export const COLORS = {
  events: '#FFBF00',
  move: '#4C97FF',
  hand: '#9966FF',
  poses: '#2AB5C9',
  control: '#FFAB19',
  speed: '#CF63CF',
  ai: '#2EAD5A',
};

const JOINT_OPTIONS = JOINTS.filter((_, i) => i !== GRIPPER).map((j) => [`${j.icon} ${j.name}`, j.id]);
const POSE_OPTIONS = (Object.keys(POSES) as PoseName[]).map((k) => [POSES[k].label, k]);
const SPEED_OPTIONS = [
  ['🐢 slow', 'slow'],
  ['🐇 medium', 'medium'],
  ['🚀 fast', 'fast'],
];

/** Trained skills, updated by the app so the AI block's dropdown stays current. */
let skillNames: string[] = [];
export function setSkillNames(names: string[]) {
  skillNames = names;
}

const stmt = { previousStatement: null, nextStatement: null };

let defined = false;

export function defineBlocks() {
  if (defined) return;
  defined = true;

  Blockly.common.defineBlocksWithJsonArray([
    {
      type: 'grip_start',
      message0: 'when ▶ Go is pressed',
      nextStatement: null,
      colour: COLORS.events,
      tooltip: 'Your program starts here. Snap blocks underneath!',
    },
    {
      type: 'grip_move',
      message0: 'move %1 to %2 °',
      args0: [
        { type: 'field_dropdown', name: 'JOINT', options: JOINT_OPTIONS },
        { type: 'field_number', name: 'VALUE', value: 30, min: -180, max: 180, precision: 1 },
      ],
      ...stmt,
      colour: COLORS.move,
      tooltip: 'Move one joint to an exact angle. 0° is the middle.',
    },
    {
      type: 'grip_turn',
      message0: 'turn %1 by %2 °',
      args0: [
        { type: 'field_dropdown', name: 'JOINT', options: JOINT_OPTIONS },
        { type: 'field_number', name: 'BY', value: 15, min: -360, max: 360, precision: 1 },
      ],
      ...stmt,
      colour: COLORS.move,
      tooltip: 'Turn a joint a little bit more from where it is now. Use a minus number to go the other way.',
    },
    {
      type: 'grip_home',
      message0: 'go home 🏠',
      ...stmt,
      colour: COLORS.move,
      tooltip: 'Go back to the safe resting pose.',
    },
    {
      type: 'grip_pose',
      message0: 'strike a pose %1',
      args0: [{ type: 'field_dropdown', name: 'POSE', options: POSE_OPTIONS }],
      ...stmt,
      colour: COLORS.poses,
      tooltip: 'Move every joint into a ready-made pose.',
    },
    {
      type: 'grip_open',
      message0: 'open hand ✋',
      ...stmt,
      colour: COLORS.hand,
    },
    {
      type: 'grip_close',
      message0: 'close hand ✊',
      ...stmt,
      colour: COLORS.hand,
      tooltip: 'Close the hand. It stops by itself if it is holding something.',
    },
    {
      type: 'grip_set_hand',
      message0: 'set hand to %1 % open',
      args0: [{ type: 'field_number', name: 'PERCENT', value: 50, min: 0, max: 100, precision: 1 }],
      ...stmt,
      colour: COLORS.hand,
    },
    {
      type: 'grip_speed',
      message0: 'set speed %1',
      args0: [{ type: 'field_dropdown', name: 'SPEED', options: SPEED_OPTIONS }],
      ...stmt,
      colour: COLORS.speed,
    },
    {
      type: 'grip_wait',
      message0: 'wait %1 seconds',
      args0: [{ type: 'field_number', name: 'SECONDS', value: 1, min: 0, max: 10, precision: 0.1 }],
      ...stmt,
      colour: COLORS.control,
    },
    {
      type: 'grip_repeat',
      message0: 'repeat %1 times',
      args0: [{ type: 'field_number', name: 'TIMES', value: 3, min: 1, max: 50, precision: 1 }],
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      ...stmt,
      colour: COLORS.control,
    },
    {
      type: 'grip_forever',
      message0: 'forever',
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      previousStatement: null,
      colour: COLORS.control,
      tooltip: 'Keeps going until you press STOP (or for 3 minutes at most).',
    },
  ]);

  Blockly.Blocks['grip_skill'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('🧠 do my trained skill')
        .appendField(
          new Blockly.FieldDropdown(() =>
            skillNames.length ? skillNames.map((n) => [n, n]) : [['(train one first)', '']],
          ),
          'TASK',
        );
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(COLORS.ai);
      this.setTooltip('Let the robot brain you trained do its skill.');
    },
  };
}

const block = (type: string, extra: object = {}) => ({ kind: 'block', type, ...extra });

export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: 'Start', colour: COLORS.events, contents: [block('grip_start')] },
    {
      kind: 'category',
      name: 'Move',
      colour: COLORS.move,
      contents: [block('grip_move'), block('grip_turn'), block('grip_home')],
    },
    { kind: 'category', name: 'Poses', colour: COLORS.poses, contents: [block('grip_pose')] },
    {
      kind: 'category',
      name: 'Hand',
      colour: COLORS.hand,
      contents: [block('grip_open'), block('grip_close'), block('grip_set_hand')],
    },
    {
      kind: 'category',
      name: 'Control',
      colour: COLORS.control,
      contents: [block('grip_wait'), block('grip_repeat'), block('grip_forever')],
    },
    { kind: 'category', name: 'Speed', colour: COLORS.speed, contents: [block('grip_speed')] },
    { kind: 'category', name: 'AI', colour: COLORS.ai, contents: [block('grip_skill')] },
  ],
};

export function makeTheme(dark: boolean) {
  return Blockly.Theme.defineTheme(dark ? 'grip-dark' : 'grip-light', {
    name: dark ? 'grip-dark' : 'grip-light',
    base: Blockly.Themes.Classic,
    startHats: true,
    fontStyle: { family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', weight: '600', size: 13 },
    componentStyles: dark
      ? {
          workspaceBackgroundColour: '#1b1a26',
          toolboxBackgroundColour: '#24222f',
          toolboxForegroundColour: '#f1effa',
          flyoutBackgroundColour: '#2c2a3a',
          flyoutForegroundColour: '#f1effa',
          flyoutOpacity: 0.95,
          scrollbarColour: '#5a5670',
          insertionMarkerColour: '#ffffff',
        }
      : {
          workspaceBackgroundColour: '#fbfaff',
          toolboxBackgroundColour: '#ffffff',
          toolboxForegroundColour: '#1d1b2f',
          flyoutBackgroundColour: '#f1effa',
          flyoutOpacity: 0.95,
          scrollbarColour: '#c8c4dc',
        },
  });
}

// --- workspace -> Program ---

export interface ConvertResult {
  program: Program;
  /** Problems found while reading blocks (block id -> message). */
  errors: { blockId: string; message: string }[];
}

export function workspaceToProgram(ws: Blockly.Workspace): ConvertResult {
  const errors: ConvertResult['errors'] = [];
  const starts = ws.getTopBlocks(true).filter((b) => b.type === 'grip_start' && b.isEnabled());
  if (!starts.length) {
    return {
      program: { version: 1, body: [] },
      errors: [{ blockId: '', message: 'Add a "when ▶ Go is pressed" block from Start, then snap blocks under it.' }],
    };
  }
  const readChain = (first: Blockly.Block | null): Stmt[] => {
    const out: Stmt[] = [];
    for (let b = first; b; b = b.getNextBlock()) {
      if (!b.isEnabled()) continue;
      const s = readBlock(b);
      if (s) out.push(s);
    }
    return out;
  };
  const num = (b: Blockly.Block, name: string) => Number(b.getFieldValue(name));
  const readBlock = (b: Blockly.Block): Stmt | null => {
    const id = b.id;
    switch (b.type) {
      case 'grip_move':
        return { kind: 'move', id, joint: b.getFieldValue('JOINT') as JointId, value: num(b, 'VALUE') };
      case 'grip_turn':
        return { kind: 'turn', id, joint: b.getFieldValue('JOINT') as JointId, by: num(b, 'BY') };
      case 'grip_home':
        return { kind: 'pose', id, pose: 'home' };
      case 'grip_pose':
        return { kind: 'pose', id, pose: b.getFieldValue('POSE') as PoseName };
      case 'grip_open':
        return { kind: 'grip', id, percent: 100 };
      case 'grip_close':
        return { kind: 'grip', id, percent: 0 };
      case 'grip_set_hand':
        return { kind: 'grip', id, percent: num(b, 'PERCENT') };
      case 'grip_speed':
        return { kind: 'speed', id, speed: b.getFieldValue('SPEED') as SpeedName };
      case 'grip_wait':
        return { kind: 'wait', id, seconds: num(b, 'SECONDS') };
      case 'grip_repeat':
        return { kind: 'repeat', id, times: num(b, 'TIMES'), body: readChain(b.getInputTargetBlock('DO')) };
      case 'grip_forever':
        return { kind: 'forever', id, body: readChain(b.getInputTargetBlock('DO')) };
      case 'grip_skill':
        return { kind: 'skill', id, task: String(b.getFieldValue('TASK') ?? '') };
      default:
        errors.push({ blockId: id, message: 'This block cannot go here.' });
        return null;
    }
  };
  // Several start blocks run one after another, top to bottom.
  starts.sort((a, b) => a.getRelativeToSurfaceXY().y - b.getRelativeToSurfaceXY().y);
  return { program: { version: 1, body: starts.flatMap((s) => readChain(s.getNextBlock())) }, errors };
}

// --- starter projects ---

type SBlock = { type: string; fields?: Record<string, unknown>; inputs?: Record<string, { block: SBlock }>; next?: { block: SBlock } };

const b = (type: string, fields?: Record<string, unknown>, inner?: SBlock[]): SBlock => {
  const out: SBlock = { type };
  if (fields) out.fields = fields;
  const chained = inner && seq(inner);
  if (chained) out.inputs = { DO: { block: chained } };
  return out;
};

function seq(blocks: SBlock[]): SBlock | undefined {
  for (let i = blocks.length - 2; i >= 0; i--) blocks[i].next = { block: blocks[i + 1] };
  return blocks[0];
}

const program = (blocks: SBlock[]) => ({
  blocks: { languageVersion: 0, blocks: [{ ...seq([b('grip_start'), ...blocks])!, x: 40, y: 40 }] },
});

export const STARTERS: Record<string, { label: string; hint: string; state: object }> = {
  wave: {
    label: '👋 Wave hello',
    hint: 'Can you make it wave 5 times? Or faster?',
    state: program([
      b('grip_speed', { SPEED: 'fast' }),
      b('grip_pose', { POSE: 'wave' }),
      b('grip_repeat', { TIMES: 3 }, [
        b('grip_move', { JOINT: 'wrist_flex', VALUE: -70 }),
        b('grip_move', { JOINT: 'wrist_flex', VALUE: -10 }),
      ]),
      b('grip_home'),
    ]),
  },
  dance: {
    label: '💃 Robot dance',
    hint: 'Add your own moves inside the repeat!',
    state: program([
      b('grip_repeat', { TIMES: 2 }, [
        b('grip_move', { JOINT: 'shoulder_pan', VALUE: 45 }),
        b('grip_open'),
        b('grip_move', { JOINT: 'shoulder_pan', VALUE: -45 }),
        b('grip_close'),
      ]),
      b('grip_pose', { POSE: 'bow' }),
      b('grip_wait', { SECONDS: 1 }),
      b('grip_home'),
    ]),
  },
  pick: {
    label: '🧸 Pick up a toy',
    hint: 'Put a soft toy in front of the arm. Change the angles until it grabs it!',
    state: program([
      b('grip_speed', { SPEED: 'slow' }),
      b('grip_open'),
      b('grip_pose', { POSE: 'reach' }),
      b('grip_close'),
      b('grip_wait', { SECONDS: 0.5 }),
      b('grip_pose', { POSE: 'stretch' }),
      b('grip_wait', { SECONDS: 1 }),
      b('grip_pose', { POSE: 'reach' }),
      b('grip_open'),
      b('grip_home'),
    ]),
  },
  blank: {
    label: '✨ Start from scratch',
    hint: 'Drag blocks from the left. Snap them under the yellow "Go" block.',
    state: program([]),
  },
};
