---
name: so-arm101-control
description: "Use when working on SO-ARM101 robot arm control: joints, servos, calibration, serial/WebSerial drivers, joint limits, speed clamping, kinematics, simulator vs hardware, emergency stop, or LeRobot motor interfaces."
---

# SO-ARM101 Control

## Hardware facts
- 6 degrees of freedom, in LeRobot order: `shoulder_pan`, `shoulder_lift`, `elbow_flex`, `wrist_flex`, `wrist_roll`, `gripper`.
- Feetech STS3215 serial bus servos, daisy-chained on a single USB serial board, IDs 1-6. Servo position is a 12-bit value (0-4095 per revolution).
- Two arms in the kit: **leader** (hand-driven, used as input) and **follower** (does the work). Leaders use different gear ratios per joint so they are easy to move.
- Always check current values against the LeRobot SO-101 docs before hard-coding; firmware, ports and baud rate can change.

## Layered architecture (keep these separate)
`Blocks / UI -> command layer (validated, unit-based) -> driver (simulator | WebSerial | LeRobot backend)`
- The command layer speaks in **degrees and 0-100% gripper**, never raw ticks.
- Every driver implements the same interface: `connect()`, `disconnect()`, `moveTo(joints, {speed})`, `getState()`, `stop()`.
- The simulator driver is the default and must behave like hardware (same limits, same latency model).

## Safety rules (non-negotiable)
1. Clamp every target to per-joint min/max from calibration, not just the block UI.
2. Limit speed and acceleration; kids' defaults are slow. Interpolate long moves into small steps.
3. A Stop button is always visible; `stop()` must work even mid-sequence and must hold or relax torque safely.
4. Hardware moves require explicit "connect to real arm" confirmation; reset to simulator on disconnect or error.
5. Watch for stalls: if position error stays high or servo load/temperature is high, stop and show a friendly message.
6. Never allow user-supplied numbers to bypass validation (blocks, imported projects, saved files).
7. Move to a safe home pose on start and end of a program; avoid the table and the arm's own base.

## Calibration
- Each arm must be calibrated: record the range of motion per joint and the middle position. Store results per arm, not globally.
- Offer a guided, step-by-step, kid-friendly calibration flow ("gently move each joint to its ends").
- Reject programs when the arm is uncalibrated.

## Kinematics tips
- Start with joint-space moves (what blocks need). Add Cartesian "go to x,y,z" later via inverse kinematics, always checking reachability and limits.
- Use a URDF of the SO-ARM101 for the 3D preview so simulator and real arm agree.

## Testing
- Unit test the clamp/validate/interpolate functions with extreme and malformed inputs.
- Test drivers against the shared interface using a fake serial port.
