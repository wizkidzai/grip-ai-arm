# GRIP AI Arm: requirements

What you need to run GRIP AI Arm: the web app, the robot arms, the AI teacher and the helper tools.
Only the first two sections are needed to use the app with pretend arms. Everything else is optional and adds a
feature.

| You want to… | You need sections |
|---|---|
| Try the app with **pretend arms** | 1 |
| Use the **real SO-ARM101 arms** | 1, 2 |
| Have **Ms. Nova**, the AI teacher, answer questions | 1, 3 |
| Give Ms. Nova a **natural voice** | 1, 3, 4 |
| Have Ms. Nova notice **game and video tabs** | 1, 5 |
| Use the **terminal tools** (copying, calibration, motor IDs) | 2, 6 |
| **Develop**, test or re-record the how-to videos | 7 |

---

## 1. The web app (required)

| Requirement | Details |
|---|---|
| Browser | **Google Chrome or Microsoft Edge** (desktop). USB robot access (WebSerial) only works in these. Other browsers can use pretend arms only. |
| Address | The app must be opened from `localhost` or an `https://` address, because Chrome only allows USB access there. |
| Computer | Any laptop or desktop from the last ~6 years. Tested on Linux (Ubuntu); Windows and macOS should work in Chrome or Edge. |
| Screen | 1280 × 720 or larger works best. Phones and tablets work for pretend arms but can't use USB. |
| Hosted version | https://wizkidzai.github.io/grip-ai-arm/ (no install, but no AI teacher there). |
| Running it yourself | **Node.js 18 or newer** (tested with 18.19.1) and npm, then `cd web && npm install && npm run dev` → http://localhost:5173 |

Main libraries (installed by `npm install`, pinned in `web/package.json`):
React 18.3.1 · Vite 5.4.21 · TypeScript 5.6.3 · Blockly 12.5.1 (block coding) · three.js 0.169.0 and
@react-three/fiber 8.18.0 (3D view) · Vitest 2.1.9 (tests).

---

## 2. The robot arms (for the real robot)

| Requirement | Details |
|---|---|
| Robot | **SO-ARM101** kit: one **leader** arm (trigger handle) and one **follower** arm (gripper jaws), each with 6 Feetech STS3215 motors on its own USB servo board. |
| Motor IDs | 1 to 6 on each arm (base, shoulder, elbow, wrist tilt, wrist spin, hand), **all different**, at **1,000,000 baud** (as set up in the LeRobot SO-101 guide). `tools/fix_motor_id.py` fixes duplicates. |
| Power | **12 V adapter → follower** (gripper jaws). **5 V adapter → leader** (trigger handle). The app refuses to connect if they look swapped, because 12 V can damage the leader's motors. |
| USB | One USB port per arm (2 in total), or a powered hub. |
| Linux permissions | Your user may need serial access: `sudo usermod -aG dialout $USER`, then log out and back in. |
| Calibration | Once per arm, in the app (1-minute guide or ⚡ Quick start), or with `tools/calibrate.py`. |
| Wrist camera (optional) | Any USB webcam (UVC). Set the **camera-safe wrist spin** on the Connect tab so the wrist can never turn the camera underneath and snap its cable. |
| Safe space | A clear table around the follower, and only soft, light objects for grabbing. A grown-up nearby for real-arm use. |

---

## 3. Ms. Nova, the AI teacher (optional)

The live class needs a small **teacher server** on the same computer (`web/server/teacher.mjs`, port **8787**).
It uses **one** of these AI options:

| Option | What you need | Notes |
|---|---|---|
| **Local AI (default)** | [Ollama](https://ollama.com) 0.32 or newer, plus a model: `ollama pull qwen2.5-coder:7b` (about 4.7 GB) | Free, no account, nothing leaves the computer. Needs about **8 GB of free RAM** (16 GB+ total recommended) and ~5 GB of disk. First answer ~14 s, then 2-3 s to start talking on a laptop CPU. Other models: set `GRIP_OLLAMA_MODEL`. |
| Claude | An Anthropic API key in `ANTHROPIC_API_KEY` (or `ant auth login`) | Used automatically if a key is set. Model `claude-opus-5-5`. Costs money per question. |

Start it with `cd web && npm run teacher`. On this computer it also runs as the user service `grip-teacher`.

Rules the teacher server enforces: a grown-up must allow it once · names, addresses, phone numbers, emails and school
names are removed before the AI sees a message · max 600 characters per message, 30 turns, 40 requests per 10 minutes ·
only pages on `localhost` may call it.

**Speaking to her (🎤)** uses the browser's speech recognition (in Chrome, audio goes to Google to turn into text).
Typing works without it.

---

## 4. Natural voice (optional)

Ms. Nova and the story videos speak with **Kokoro**, an open-source neural voice that runs on this computer
(`web/server/voice/voice_server.py`, port **8788**, user service `grip-voice`).

| Requirement | Details |
|---|---|
| Python | **3.10 or newer** with `venv` (tested with 3.14) |
| Python packages | `kokoro-onnx` (0.4.7), `soundfile`, `onnxruntime`, `numpy`: `cd web/server/voice && python3 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile` |
| Voice files | `kokoro-v1.0.onnx` (311 MB) and `voices-v1.0.bin` (27 MB) from the [kokoro-onnx releases](https://github.com/thewh1teagle/kokoro-onnx/releases) (`model-files-v1.0`), placed in `web/server/voice/`. Not stored in Git (too large). |
| Speed | Runs about 2.5× faster than real time on a laptop CPU, so speech starts 1-3 s after the text. |

Without it, the app uses the browser's least robotic built-in voice.

---

## 5. GRIP Focus Helper extension (optional)

Lets Ms. Nova say "Please close the YouTube tab" during a class. A web page can't see other tabs on its own.

| Requirement | Details |
|---|---|
| Browser | Google Chrome (or another Chromium browser that allows unpacked extensions) |
| Install | `chrome://extensions` → **Developer mode** → **Load unpacked** → choose `web/extension`. Install it in the **same Chrome profile** the app is used in, then reload the app. |
| What it can see | Only tabs on the game, video and social sites listed in `web/extension/sites.js`. It reports only the site name, works only on the GRIP app's pages, and stores nothing. |

---

## 6. Terminal tools (optional)

`tools/teleop.py` (leader → follower copying), `tools/calibrate.py` (voice-guided calibration of both arms) and
`tools/fix_motor_id.py` (fix duplicate motor IDs).

| Requirement | Details |
|---|---|
| Python | 3.10 or newer |
| Package | `pyserial` (tested with 3.5): `pip install pyserial` |
| Voice prompts (calibrate.py `--voice`) | `spd-say` (speech-dispatcher), usually installed on Ubuntu |
| Note | Only one program can use the arms at a time. Disconnect them in the app first. The tools restore the port settings when they exit, so Chrome can connect again afterwards. |

---

## 7. For developers (optional)

| Task | Command / requirement |
|---|---|
| Tests | `cd web && npm test` (75 unit and simulated-arm tests) |
| Type check + build | `npm run build` |
| Publish | Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy-pages.yml` (Node 22 in CI). Repo setting: Settings → Pages → Source: **GitHub Actions**. |
| How-to videos | `npm run videos` (records the real app in Chrome and builds MP4s). Needs everything in section 4, Google Chrome, and **ffmpeg** with libx264 and AAC (set `FFMPEG=` if it isn't on the PATH). The app must be running (`npm run dev`). |
| Background services (this computer) | `systemctl --user status grip-ai-arm grip-teacher grip-voice` (app on http://localhost:8080, teacher, voice) |

---

## 8. Privacy and safety requirements (the app is for kids)

- No accounts, ads, tracking or analytics. Demos, brains, calibrations and progress stay in the browser on that computer
  (`localStorage`) and can be deleted in ⚙️ Settings.
- The camera is off until switched on and the video is never saved or sent.
- The AI teacher needs a grown-up's permission once, removes personal details before the AI sees them, stays on
  robotics and STEM topics, and tells kids to talk to a trusted adult about anything serious.
- Every robot move goes through the safety layer: calibrated limits, speed limits, a stuck-joint check and an
  always-visible **STOP** (or the Esc key).
