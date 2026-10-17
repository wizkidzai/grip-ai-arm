---
name: physical-ai-training
description: "Use when implementing or explaining AI model training for the robot arm: imitation learning, behavior cloning, ACT, diffusion policy, LeRobot training, evaluation, overfitting, deploying a trained policy to the follower arm, training UI and progress."
---

# Physical AI: Training and Running Policies

## Core ideas
- **Physical AI** = AI that senses and acts in the real world (cameras + joint sensors in, motor commands out).
- **Imitation learning / behavior cloning**: the model learns a **policy** mapping observations (images, joint positions) to actions by copying human demonstrations.
- Common policies in LeRobot: **ACT** (Action Chunking Transformer; good starting point for SO-101 tasks), **Diffusion Policy**, and others. Prefer ACT for beginners; confirm current options in LeRobot docs.

## Pipeline
`record demos -> dataset check -> train -> evaluate in safe conditions -> run on follower -> improve data`
- Training is GPU-heavy and runs on a Python backend (local GPU or cloud such as Colab); the web app submits jobs and shows progress.
- Typical CLI: `lerobot-train` with dataset, policy type, and output directory. Verify flags against the installed LeRobot version.
- Show friendly progress: steps, loss curve, estimated time, and a "stop" button. Save checkpoints.

## Running a trained policy
- Policy outputs action chunks; execute them through the same safety layer (clamps, speed limits, Stop button) as block programs.
- Run in simulator or with a human hand on Stop first; limit episode length.
- Auto-stop on errors, low confidence if available, or leaving the workspace.

## Evaluation (teach it as science)
- Run 10 trials; count successes; record a success rate.
- Change one thing at a time (more demos, different lighting) and compare.
- Common failures: too little or inconsistent data, camera moved, new lighting, object in a different place than demonstrated.

## Learner-friendly vocabulary
| Technical | Kid-friendly |
|---|---|
| dataset | practice examples |
| episode | one demonstration |
| policy / model | the robot's brain |
| training | learning from examples |
| overfitting | memorizing instead of understanding |
| loss | how many mistakes it's making (lower is better) |

## Engineering guidance
- Keep training code in a separate Python service with a clear API (start job, status, cancel, list models).
- Reproducibility: store dataset version, config, seed, and LeRobot version with each model.
- Keep the web UI agnostic of the specific policy so new policies can be added.
- Test the job API with a fake trainer; test the safety layer with adversarial action outputs (NaN, huge jumps).
