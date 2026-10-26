import { useState } from 'react';
import { Episode } from '../ai/episodes';
import { SavedPolicy } from '../ai/policy';
import { storage } from '../storage';
import { Ask, Robot } from './useRobot';

function has(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function remove(...keys: string[]) {
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* fine */
    }
  }
}

const CAL_KEYS = [
  'grip.calibration.v3.leader',
  'grip.calibration.v3.follower',
  // older versions of the app
  'grip.calibration.leader',
  'grip.calibration.follower',
];

interface Item {
  id: string;
  icon: string;
  label: string;
  summary: string;
  saved: boolean;
  /** Shown in the confirmation when this item is being deleted. */
  warning?: string;
  remove: () => void;
}

/** Everything the app keeps in this browser, with "delete selected" and "delete everything". */
export function SettingsPanel({
  robot,
  episodes,
  setEpisodes,
  skills,
  setSkills,
  confirm,
}: {
  robot: Robot;
  episodes: Episode[];
  setEpisodes: (e: Episode[]) => void;
  skills: SavedPolicy[];
  setSkills: (s: SavedPolicy[]) => void;
  confirm: Ask;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [, refresh] = useState(0);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

  const items: Item[] = [
    {
      id: 'demos',
      icon: '📚',
      label: 'Demos',
      summary: plural(episodes.length, 'recording'),
      saved: episodes.length > 0,
      remove: () => setEpisodes([]),
    },
    {
      id: 'brains',
      icon: '🧠',
      label: 'Trained brains',
      summary: plural(skills.length, 'brain'),
      saved: skills.length > 0,
      remove: () => setSkills([]),
    },
    {
      id: 'blocks',
      icon: '🧩',
      label: 'Block-coding project',
      summary: has('grip.blocks.v1') ? 'saved' : 'nothing saved',
      saved: has('grip.blocks.v1'),
      warning: 'The Code tab will start again from the "Wave hello" example.',
      remove: () => remove('grip.blocks.v1'),
    },
    {
      id: 'calibration',
      icon: '📏',
      label: 'Arm calibrations',
      summary: CAL_KEYS.filter(has).length ? 'saved' : 'nothing saved',
      saved: CAL_KEYS.some(has),
      warning: 'Both arms will ask to be calibrated again the next time you connect them.',
      remove: () => remove(...CAL_KEYS),
    },
    {
      id: 'wrist',
      icon: '📷',
      label: 'Camera-safe wrist spin',
      summary: robot.wristSafe
        ? `${Math.round(robot.wristSafe.min)}° to ${Math.round(robot.wristSafe.max)}°`
        : has('grip.wristSafe')
          ? 'saved'
          : 'not set',
      saved: !!robot.wristSafe || has('grip.wristSafe'),
      warning: 'Without it, the wrist can spin a wrist camera underneath and snap its cable. Set it again on the Connect tab.',
      remove: () => {
        if (robot.slots.follower.arm) robot.setWristSafe(null);
        storage.clearWristSafe();
      },
    },
    {
      id: 'hand',
      icon: '🔄',
      label: 'Hand flip switch',
      summary: robot.handFlipped ? 'flipped' : 'normal',
      saved: robot.handFlipped || has('grip.handFlipped'),
      remove: () => {
        robot.setHandFlipped(false);
        remove('grip.handFlipped');
      },
    },
    {
      id: 'learn',
      icon: '🎓',
      label: 'Academy progress',
      summary: has('grip.learn') ? 'saved (classes, badges, level)' : 'not started',
      saved: has('grip.learn'),
      warning: 'Classes, badges and your level will start again from the beginning.',
      remove: () => remove('grip.learn', 'grip.learn.voice'),
    },
    {
      id: 'challenges',
      icon: '📋',
      label: 'Challenge sheets',
      summary: has('grip.challenges') ? 'saved (classes, finished challenges, notes)' : 'none yet',
      saved: has('grip.challenges'),
      warning: 'Ms. Nova will start again from the first challenge.',
      remove: () => remove('grip.challenges'),
    },
    {
      id: 'camera',
      icon: '🎥',
      label: 'Camera choice',
      summary: has('grip.camera') ? 'remembered' : 'not set',
      saved: has('grip.camera'),
      remove: () => remove('grip.camera'),
    },
  ];

  const savedItems = items.filter((i) => i.saved);
  const chosen = savedItems.filter((i) => picked.has(i.id));

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const doDelete = async (list: Item[], everything: boolean) => {
    if (!list.length) return;
    const warnings = list.filter((i) => i.warning).map((i) => `• ${i.label}: ${i.warning}`);
    const ok = await confirm(
      everything ? 'Delete everything?' : `Delete ${plural(list.length, 'item')}?`,
      `${list.map((i) => i.label).join(', ')} will be deleted from this computer. This can't be undone.` +
        (warnings.length ? `\n\n${warnings.join('\n')}` : ''),
      everything ? '🗑 Delete everything' : '🗑 Delete',
      'Keep it',
    );
    if (!ok) return;
    list.forEach((i) => i.remove());
    setPicked(new Set());
    refresh((n) => n + 1);
    robot.setNotice({ kind: 'success', text: `Deleted: ${list.map((i) => i.label).join(', ')}.` });
  };

  return (
    <section aria-labelledby="settings-title">
      <div className="panel-head">
        <h2 id="settings-title">⚙️ Settings</h2>
        <p className="hint">Everything here is saved only in this browser, on this computer. Nothing is uploaded.</p>
      </div>
      <div className="card">
        <h3>🗂️ Saved on this computer</h3>
        <ul className="episodes settings-list">
          {items.map((i) => (
            <li key={i.id} className={picked.has(i.id) ? 'picked' : ''}>
              <label className={`pick ${i.saved ? '' : 'empty'}`}>
                <input
                  type="checkbox"
                  disabled={!i.saved}
                  checked={picked.has(i.id) && i.saved}
                  onChange={() => toggle(i.id)}
                />
                <span>
                  <span aria-hidden="true">{i.icon}</span> <strong>{i.label}</strong>{' '}
                  <span className="hint">· {i.summary}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="row select-bar">
          <button className="btn" disabled={!chosen.length} onClick={() => doDelete(chosen, false)}>
            🗑 Delete selected{chosen.length ? ` (${chosen.length})` : ''}
          </button>
          <button className="btn danger" disabled={!savedItems.length} onClick={() => doDelete(savedItems, true)}>
            Delete everything
          </button>
        </div>
        <p className="hint">
          Deleting doesn't change anything stored inside the robot's motors. To pick single demos or brains, use the
          lists on the Teach and Train tabs.
        </p>
      </div>
    </section>
  );
}
