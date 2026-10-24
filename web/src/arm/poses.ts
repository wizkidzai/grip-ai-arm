import { HOME, Joints } from './joints';

/** Preset poses shared by the Drive panel and the pose block. */
export const POSES = {
  home: { label: '🏠 Home', joints: HOME },
  wave: { label: '👋 Wave up', joints: [0, -10, -70, -40, 0, 80] },
  reach: { label: '🤲 Reach forward', joints: [0, 40, -10, 20, 0, 70] },
  look: { label: '👀 Look down', joints: [0, 20, 30, 60, 0, 30] },
  stretch: { label: '🙆 Stretch up', joints: [0, 0, -85, 0, 0, 30] },
  bow: { label: '🙇 Take a bow', joints: [0, 55, 40, 50, 0, 10] },
} satisfies Record<string, { label: string; joints: Joints }>;

export type PoseName = keyof typeof POSES;

export const isPoseName = (v: unknown): v is PoseName => typeof v === 'string' && v in POSES;
