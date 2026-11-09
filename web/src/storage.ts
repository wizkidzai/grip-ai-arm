import { ArmCalibration, isCalibration } from './arm/calibration';
import { ArmRole } from './arm/arm';
import { Episode, isEpisode } from './ai/episodes';
import { SavedPolicy, isSavedPolicy } from './ai/policy';

/**
 * Everything is stored only in this browser (no accounts, no uploads).
 * Every read is validated, so a damaged or hand-edited value can never
 * reach the motors.
 */
const KEYS = {
  // v3: older calibrations may have been made with the power adapters swapped.
  calibration: (role: ArmRole) => `grip.calibration.v3.${role}`,
  wristSafe: 'grip.wristSafe',
  episodes: 'grip.episodes',
  skills: 'grip.skills',
};

function read(key: string): unknown {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

/** Returns false if the browser is out of space or storage is blocked. */
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const storage = {
  loadCalibration(role: ArmRole): ArmCalibration | null {
    const v = read(KEYS.calibration(role));
    return isCalibration(v) ? v : null;
  },
  saveCalibration(role: ArmRole, cal: ArmCalibration) {
    return write(KEYS.calibration(role), cal);
  },
  /** Camera-safe wrist range, only valid for the follower calibration it was measured with. */
  loadWristSafe(calibratedAt: string): { min: number; max: number } | null {
    const v = read(KEYS.wristSafe) as { calibratedAt?: string; min?: number; max?: number } | null;
    if (!v || v.calibratedAt !== calibratedAt) return null;
    if (!Number.isFinite(v.min) || !Number.isFinite(v.max) || Math.abs(v.max! - v.min!) < 10) return null;
    return { min: v.min!, max: v.max! };
  },
  saveWristSafe(calibratedAt: string, min: number, max: number) {
    return write(KEYS.wristSafe, { calibratedAt, min, max });
  },
  clearWristSafe() {
    try {
      localStorage.removeItem(KEYS.wristSafe);
    } catch {
      /* fine */
    }
  },
  loadEpisodes(): Episode[] {
    const v = read(KEYS.episodes);
    return Array.isArray(v) ? v.filter(isEpisode) : [];
  },
  saveEpisodes(episodes: Episode[]) {
    return write(KEYS.episodes, episodes);
  },
  loadSkills(): SavedPolicy[] {
    const v = read(KEYS.skills);
    return Array.isArray(v) ? v.filter(isSavedPolicy) : [];
  },
  saveSkills(skills: SavedPolicy[]) {
    return write(KEYS.skills, skills);
  },
};

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
