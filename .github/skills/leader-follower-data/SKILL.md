---
name: leader-follower-data
description: "Use when building leader-follower teleoperation and demonstration recording: mirroring leader arm to follower, recording episodes, datasets (LeRobot format), cameras, sync, replay, data quality and storage for AI training."
---

# Leader-Follower Teleoperation and Data Recording

## Concept (for explaining)
A person moves the **leader** arm; the **follower** copies it in real time. While this happens, the system records what the follower sees (camera images) and what the arm does (joint positions and actions). Those recordings are **demonstrations** the AI learns from.

## Teleoperation loop
1. Read leader joint positions at a fixed rate (e.g. 30-60 Hz).
2. Map leader calibration to follower calibration (each arm has its own range).
3. Clamp to follower limits and rate-limit, then send to follower.
4. Log leader action, follower state, camera frames, and timestamps.
- Watch latency and dropped frames; show a connection-quality indicator.
- If the leader disconnects, hold the follower still; never jump to a stale target.

## Recording episodes
- Use the **LeRobot** dataset format so recorded data works with its training tools (episodes of frames with `observation.state`, `observation.images.*`, `action`, timestamps, and a task description).
- Typical flow: choose a task name, record N episodes of a fixed length, reset the scene between episodes, review and keep or discard each episode.
- UI: big Record / Stop / Re-record buttons, a countdown, a reset-the-scene timer, and a live episode counter.
- Confirm exact CLI/API (`lerobot-record`, `lerobot-teleoperate`) against current LeRobot docs; they evolve.

## Data quality guidance
- 50 good, consistent episodes beat 200 sloppy ones for a simple task.
- Keep camera positions, lighting, and the starting pose consistent; vary object placement slightly.
- Make slow, deliberate, repeatable movements; avoid pauses and mistakes (or discard the episode).
- Let learners review episodes and delete bad ones; this teaches data-centric thinking.

## Privacy
- Cameras may capture faces, rooms, and other people. Default to a camera view of the workspace only, show a visible "recording" indicator, and keep data local or under parental/teacher-controlled storage by default.
- Never upload minors' recordings to public hubs (e.g. Hugging Face) without explicit adult consent.
- Strip metadata; no real names in dataset names.

## Testing
- Replay recorded episodes in the simulator and compare trajectories.
- Fake leader/follower drivers for CI.
