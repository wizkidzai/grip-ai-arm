/**
 * SO-ARM101 joint definitions, in LeRobot order.
 * Joints 0-4 are in degrees relative to the calibrated middle pose.
 * Joint 5 (gripper) is 0-100 % open.
 */
export const JOINT_IDS = [
  'shoulder_pan',
  'shoulder_lift',
  'elbow_flex',
  'wrist_flex',
  'wrist_roll',
  'gripper',
] as const;

export type JointId = (typeof JOINT_IDS)[number];

/** Six numbers: five angles in degrees, then gripper percent. */
export type Joints = [number, number, number, number, number, number];

export const NUM_JOINTS = 6;
export const GRIPPER = 5;

export interface JointInfo {
  id: JointId;
  /** Kid-friendly name shown in the UI. */
  name: string;
  icon: string;
  unit: '°' | '%';
  /** Feetech servo ID on the bus. */
  servoId: number;
}

export const JOINTS: JointInfo[] = [
  { id: 'shoulder_pan', name: 'Base spin', icon: '🔄', unit: '°', servoId: 1 },
  { id: 'shoulder_lift', name: 'Shoulder', icon: '💪', unit: '°', servoId: 2 },
  { id: 'elbow_flex', name: 'Elbow', icon: '🦾', unit: '°', servoId: 3 },
  { id: 'wrist_flex', name: 'Wrist tilt', icon: '↕️', unit: '°', servoId: 4 },
  { id: 'wrist_roll', name: 'Wrist spin', icon: '🌀', unit: '°', servoId: 5 },
  { id: 'gripper', name: 'Hand', icon: '✋', unit: '%', servoId: 6 },
];

export const HOME: Joints = [0, 0, 0, 0, 0, 30];

export function zeroJoints(): Joints {
  return [0, 0, 0, 0, 0, 0];
}

export function isJoints(v: unknown): v is Joints {
  return Array.isArray(v) && v.length === NUM_JOINTS && v.every((x) => typeof x === 'number');
}
