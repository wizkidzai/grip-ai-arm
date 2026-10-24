# GRIP AI Arm — web app

Code, drive and teach a **SO-ARM101** robot arm:

| Tab | What kids do |
|---|---|
| 🔌 Connect | Connect real arms over USB (or pretend arms), calibrate, turn motors on |
| 🕹️ Drive | Move the follower with big buttons, sliders and ready-made poses |
| 🧩 Code | Scratch-style block coding (Blockly): moves, poses, hand, loops, waits, speed, trained skills |
| 🪞 Teach | Move the **leader**, the **follower** copies; record demos |
| 🧠 Train | Train a small "robot brain" in the browser from the demos |
| 🚀 Try it | The follower does the task by itself; test it 10 times like a scientist |

```
npm install
npm run dev        # http://localhost:5173
npm test           # unit + simulated-arm integration tests
npm run build      # typecheck + production build
```

No robot? Click **"Use a pretend arm"** for both arms. The sliders act as your hand on the leader.

## Using the real SO-ARM101 kit
1. Plug in the power supply for **each** arm, then both USB cables.
2. Open the app in **Chrome or Edge** (WebSerial is needed; served from `localhost` or HTTPS).
3. Click **Connect real arm** on the leader card and pick its USB port, then do the same for the follower.
   On Linux you may need serial access: `sudo usermod -aG dialout $USER`, then log out and back in.
4. Each arm runs a 1-minute guided calibration the first time (middle pose → move every joint end to end
   → close the hand). It's stored per arm in this browser.
5. **Turn motors on** for the follower, then go to **Teach**.

Motor IDs 1–6 must be set up as in the LeRobot SO-101 guide (`shoulder_pan` … `gripper`), at 1 Mbps.

**Power:** the **12 V** adapter goes on the **follower** (gripper jaws), the **5 V** adapter on the
**leader** (trigger handle). The app checks this on connect and refuses if they look swapped.

**Quick start:** arms that were already set up can skip the guided calibration with "⚡ Quick start".

**"Copy me"** copies how far each leader joint moves from where it started, so the arms don't need to
start in the same pose and nothing jumps.

**Without the app:** `python3 ../tools/teleop.py --leader /dev/ttyACM0 --follower /dev/ttyACM1`
does the same leader → follower copying from a terminal (Ctrl+C to stop). Only one program can use the
arms at a time: disconnect them in the app first.

**"The device has been lost" / can't connect after using Python tools (Linux):** pyserial-based tools
(LeRobot, older scripts) leave the port with `VMIN=0`, and Chrome then thinks the arm vanished. Unplug and
replug the arm's USB cable, or run `stty -F /dev/ttyACM0 min 1 time 0` (and the same for `ttyACM1`).
`tools/teleop.py` and `tools/fix_motor_id.py` put this back automatically when they exit.

## How it fits together
```
UI (React)  ──>  Controller (30 Hz loop: teleop / replay / AI skill / recording)
                   │
                   ▼
                 Arm (degrees & gripper %, safety: clamp + rate-limit + stall check)
                   │
                   ▼
                 ServoBus: SerialBus (WebSerial, Feetech STS3215 protocol) | SimBus (simulator)
```
| Path | What |
|---|---|
| `src/arm/safety.ts` | Joint clamping, speed limits, NaN rejection, stall detection |
| `src/arm/calibration.ts` | Ticks ⇄ degrees, guided calibration recorder |
| `src/drivers/feetech.ts` | STS3215 packet encode/decode (pure, tested) |
| `src/drivers/serialBus.ts` | WebSerial transport (sync read/write, unplug detection) |
| `src/control/controller.ts` | The motion loop and recording |
| `src/ai/policy.ts` | Behaviour-cloning MLP trained in-browser (Adam, noise augmentation) |
| `src/ai/episodes.ts` | Demo format + LeRobot-style export |
| `src/blocks/program.ts` | Block program format, compiler (validation, loop caps), "show me the code" |
| `src/blocks/runner.ts` | Steps compiled commands through the controller, highlights the running block |
| `src/blocks/blocklyDefs.ts` | Block definitions, toolbox, theme, starter projects |

Block programs are never turned into JavaScript and run: blocks → validated program → flat command
list (max 2000 commands, max 3 minutes) → the same safety layer as everything else.

## Safety
- Pretend arms are offered alongside real ones; real moves need a "Hands clear?" confirmation.
- The **STOP** button (or **Esc**) is always on screen; it holds the follower in place.
- Every command is clamped to the follower's calibrated range (minus a 3° margin) and to hard limits,
  and rate-limited (🐢 45 / 🐇 90 / 🚀 150 °/s).
- Turning motors on never jumps: the goal is set to the present position first.
- Auto-stop on: tab hidden, USB unplugged, leader readings lost, a joint stuck > 1.2 s, or any bus error.
- Calibration stores one EEPROM setting per motor, the homing offset (like LeRobot), so the middle pose reads
  2047 and no joint range crosses the 0/4095 wrap. Everything else is RAM only (torque, goal position).
  Goal positions are clamped, never wrapped.

## Privacy
Everything stays in this browser's `localStorage`: no accounts, uploads, analytics or cameras.
"Download data" saves demos as a local JSON file.

## Limits / next steps
- The in-browser brain uses joint positions only (no camera), so it learns *movements*, not to react to
  where objects are. For vision-based tasks, export the data and train ACT with LeRobot on a GPU
  (a Python backend is the planned next step).
- Not yet tested on physical hardware. Check joint directions in the 3D preview against your arm.
- Calibrating in this app replaces any homing offsets set by LeRobot (re-run LeRobot calibration if you switch back).
- Blockly's keyboard-navigation plugin isn't added yet, so blocks need a mouse or touch.
