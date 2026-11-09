# GRIP AI Arm: requirements backlog

The list of everything GRIP AI Arm should do, what is finished, and what is left. Setup needs (hardware, software)
are in [requirements.md](requirements.md).

**Priority:** P0 = must have · P1 = should have · P2 = nice to have
**Status:**
✅ Done (tested on the real arms) · 🧪 Done (tested with pretend or emulated arms only) ·
🚧 In progress · ⏳ To do · 💡 Idea

Last updated: 2026-10-25

---

## Next up

| # | Item | Why | Priority |
|---|---|---|---|
| 1 | **I3** Push the unpublished work to GitHub | Everything from the camera-safe wrist onward exists only on one computer | P0 |
| 2 | **J2** Test the app's latest features on the real arms | Several fixes were only tested with pretend arms | P0 |
| 3 | **F5** Confirm the girls-in-robotics statistics and add sources | The numbers come from GRIP's mission statement, not a checked study | P0 |
| 4 | **F4** Finish recording the 5 how-to videos | Voices, characters and scripts are ready; recording stopped on a timing issue | P1 |
| 5 | **D5** Keyboard-operable blocks | Accessibility requirement (WCAG AA) not met in the Code tab | P1 |

---

## A. Connecting the arms and safety

| ID | Requirement | Priority | Status |
|---|---|---|---|
| A1 | Connect the leader and follower arms over USB (WebSerial, Feetech STS3215) | P0 | ✅ |
| A2 | Pretend arms, so everything works without a robot | P0 | 🧪 |
| A3 | "Connect both arms": sort leader and follower by power (5 V / 12 V); ask before using a swapped pick | P0 | ✅ |
| A4 | Refuse to connect when power adapters look swapped (12 V can damage the leader) | P0 | ✅ |
| A5 | Explain which motor isn't answering; detect duplicate motor IDs; `tools/fix_motor_id.py` to fix them | P0 | ✅ |
| A6 | Calibration: guided 1-minute flow, ⚡ Quick start with hand steps, homing offsets, stale motor limits reset on connect | P0 | ✅ (Quick start hand steps 🧪) |
| A7 | Always-visible STOP and Esc; calibrated limits; speed limits; stuck-joint check; no jump when motors turn on | P0 | ✅ |
| A8 | Disconnect and closing the tab really release the USB port | P0 | 🧪 (unit test; not yet confirmed in real Chrome) |
| A9 | Recover from USB glitches and from ports left in a bad state by Python tools ("device has been lost") | P0 | ✅ |
| A10 | Camera-safe wrist spin: never turn the wrist camera underneath | P0 | 🧪 |
| A11 | Control the arms from another device on the home network (relay or Raspberry Pi) | P2 | 💡 |

## B. Copy me (leader → follower)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| B1 | The follower copies the leader's movements, starting from wherever both arms are, with no jump | P0 | ✅ (terminal tool) · 🧪 (app) |
| B2 | Only one control loop can run (fixes the follower barely moving) | P0 | 🧪 |
| B3 | "Copy me" keeps going through read errors and stuck joints (warns, never stops by itself) | P0 | 🧪 |
| B4 | Hand: squeeze closes, let go opens; firm grip (~10 % motor effort) | P0 | ✅ (terminal tool) |
| B5 | Hand never moves by itself at start; catches on a clear squeeze; "Flip it" switch | P0 | 🧪 |
| B6 | No dead zone when the leader goes past the follower's reach | P1 | 🧪 |
| B7 | Real-pose copying after `tools/calibrate.py` (both arms calibrated together, voice-guided) | P1 | 🚧 Built, not yet run on the real arms |

## C. Drive, 3D view and camera

| ID | Requirement | Priority | Status |
|---|---|---|---|
| C1 | Drive tab: pose buttons, joint cards with − / + and sliders, hand open/close, speed | P0 | 🧪 |
| C2 | 3D view of the follower: drag to turn, "going to" ghost, joint highlight | P1 | 🧪 |
| C3 | Live camera view (off by default, nothing saved or sent, flip button) | P1 | ✅ |

## D. Block coding

| ID | Requirement | Priority | Status |
|---|---|---|---|
| D1 | Scratch-style blocks: move, turn, poses, hand, wait, repeat, forever, speed, trained skill | P0 | 🧪 |
| D2 | Safe compiler: no `eval`, checked angles with kid-friendly errors, max 2000 commands / 3 minutes | P0 | 🧪 |
| D3 | New blocks: move 3 joints, glide, nod, shake, wiggle, random angle, "maybe", random wait, say, play sound | P1 | 🧪 |
| D4 | Running block lights up; "Show me the code" (Python); starter projects; work saves by itself | P1 | 🧪 |
| D5 | Blocks usable with the keyboard only (Blockly keyboard-navigation plugin) | P1 | ⏳ |
| D6 | Variables and "save my pose / go to my pose" blocks | P2 | ⏳ |
| D7 | Sensing blocks ("camera sees red", "arm is at pose") | P2 | 💡 |

## E. AI training

| ID | Requirement | Priority | Status |
|---|---|---|---|
| E1 | Record, replay, pick and delete demos | P0 | 🧪 |
| E2 | Train a small "robot brain" in the browser (imitation learning) with a mistakes chart | P0 | 🧪 |
| E3 | Try it: the brain drives the follower; 10-try success-rate tracker | P0 | 🧪 |
| E4 | Download demos in a LeRobot-style format | P1 | 🧪 |
| E5 | Save camera images with demos (off by default, clear recording sign, consent) | P2 | ⏳ |
| E6 | Python LeRobot backend to train bigger, vision-based models (ACT) on a GPU | P2 | ⏳ |

## F. GRIP Academy (learning path)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| F1 | 🎓 Teach me: story of Maya and Pip in animated scenes with narration and subtitles | P1 | 🧪 |
| F2 | Six classes with a video and a mission each; missions tick themselves off; badges; saved progress | P1 | 🧪 |
| F3 | Levels: Explorer (8–10), Builder (11–13), Engineer (14–17) with deeper content for older learners | P1 | 🧪 |
| F4 | Real MP4 how-to videos: Maya and Ms. Nova talking (natural voices, lip sync) over the real app, with captions | P1 | 🚧 Voices, characters, studio and scripts done; recording needs a timing fix |
| F5 | Confirm the 50 % / 20 % / 16 % statistics against published sources and show the source | P0 | ⏳ |
| F6 | Review the role-model facts (Howard, Breazeal, Rus, Li) | P1 | ⏳ |

## G. Ms. Nova, the AI teacher

| ID | Requirement | Priority | Status |
|---|---|---|---|
| G1 | 📹 Live class: video-call screen, talk (🎤) or type, raise hand, subtitles | P1 | 🧪 |
| G2 | Free local AI (Ollama), with Claude as an option when an API key is set | P1 | ✅ (local AI tested end to end) |
| G3 | Grown-up consent once; personal details removed before the AI sees them; guaranteed privacy reminder | P0 | ✅ |
| G4 | Stays on topic, kid-safe, never invents app features (uses the challenge sheet and app note) | P0 | ✅ (spot-checked; small local models can still make mistakes) |
| G5 | Natural human-sounding voice (Kokoro) with 4 voices to choose from | P1 | ✅ |
| G6 | 🤖 Try robot: shrink the call to a corner window and keep using the app | P1 | 🧪 |
| G7 | New challenge sheet every class: 20 challenges in 12 kinds, a different kind each time, quizzes, print | P1 | 🧪 |
| G8 | "Please close the YouTube tab" via the GRIP Focus Helper extension; reminder without it | P1 | 🧪 (works in Chromium; confirm in the user's Chrome profile) |
| G9 | Faster answers (smaller model, or the laptop's GPU/NPU) | P2 | ⏳ |
| G10 | A test set of questions to check Ms. Nova's answers stay correct and safe | P1 | ⏳ |

## H. Data, privacy and settings

| ID | Requirement | Priority | Status |
|---|---|---|---|
| H1 | No accounts, ads, tracking or analytics; data stays in the browser on that computer | P0 | ✅ |
| H2 | ⚙️ Settings: see everything saved, delete selected or everything (with confirmation) | P1 | 🧪 |
| H3 | Pick-and-delete for demos and trained brains | P1 | 🧪 |

## I. Delivery

| ID | Requirement | Priority | Status |
|---|---|---|---|
| I1 | Code on GitHub (`wizkidzai/grip-ai-arm`) through pull requests | P0 | ✅ PRs #1–#3 merged |
| I2 | Hosted on GitHub Pages with automatic deploys | P1 | ✅ https://wizkidzai.github.io/grip-ai-arm/ |
| I3 | Publish the work since PR #3 (camera-safe wrist, settings, Academy, Ms. Nova, voice, blocks, challenges, extension, studio) | P0 | ⏳ On branch `feature/camera-safe-wrist`, not committed |
| I4 | Always-on local copy with teacher and voice (user services on this computer) | P1 | ✅ http://localhost:8080 |
| I5 | requirements.md and this backlog | P1 | ✅ |

## J. Quality

| ID | Requirement | Priority | Status |
|---|---|---|---|
| J1 | Automated tests for safety, protocol, calibration, compiler, controller and challenges | P0 | ✅ 75 tests passing |
| J2 | Real-arm test pass of the app: Connect both, Quick start hand steps, Copy me, hand catch/flip, camera-safe wrist | P0 | ⏳ |
| J3 | Accessibility check (WCAG AA): keyboard, screen reader labels, contrast, reduced motion | P1 | ⏳ Partly built in; no full audit yet |
| J4 | Test on Windows and macOS (Chrome and Edge) | P2 | ⏳ |
