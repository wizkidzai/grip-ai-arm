#!/usr/bin/env python3
"""Calibrate BOTH SO-ARM101 arms from zero, with spoken instructions.

    python3 tools/calibrate.py                 # press Enter between steps (in a terminal)
    python3 tools/calibrate.py --voice         # timed steps, spoken out loud (hands stay free)

Steps:
  1. Clear old settings in every motor (stored middle + position limits).
  2. Middle pose: hold the FOLLOWER in the middle pose -> it is saved and the follower
     holds itself there. Then put the LEADER in the same pose -> saved.
  3. Range: move every joint of each arm from end to end.
  4. Hand: open / close each hand (leader: thumb trigger, follower: jaw).
  5. Save tools/calibration.json (tools/teleop.py then copies the leader's real pose).

The "middle" is stored in each motor (homing offset, like LeRobot), so both arms read
2047 in the same pose. Needs: pip install pyserial; spd-say for --voice.
"""
import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from teleop import HAND, IDS, NAMES, Bus, check_power, find_arms  # noqa: E402

OUT = Path(__file__).with_name("calibration.json")
HAND_OUT = Path(__file__).with_name("hand_calibration.json")
ADDR_MIN_LIMIT, ADDR_HOMING, ADDR_TORQUE, ADDR_GOAL, ADDR_LOCK = 9, 31, 40, 42, 55
HALF_TURN = 2047
GRIP_SQUEEZE = 35  # ticks past "jaw tips touch" so the follower can hold things (~10 % effort)
MIN_SPAN = 400  # ticks (~35 deg) a joint must move during the range step

VOICE = False


def say(text, wait=True):
    print(f"\n>>> {text}", flush=True)
    if VOICE and shutil.which("spd-say"):
        subprocess.run(["spd-say", "-r", "-15"] + (["-w"] if wait else []) + [text], check=False)


def pause(seconds, text):
    """Interactive: wait for Enter. Voice mode: count down out loud."""
    if not VOICE:
        input(f"    ({text} Then press Enter.)")
        return
    t_end = time.time() + seconds
    while (left := t_end - time.time()) > 0:
        if left <= 3.2:
            say(str(int(round(left))), wait=False)
            time.sleep(1)
        else:
            time.sleep(min(1, left - 3))


def encode_offset(v):
    mag = min(2047, abs(int(round(v))))
    v = mag | 0x800 if v < 0 else mag
    return [v & 0xFF, v >> 8]


def clear_and_home(bus):
    """Forget old settings, then store the current pose as the middle (reads 2047)."""
    for i in IDS:
        bus.write(i, ADDR_TORQUE, [0])
        bus.write(i, ADDR_LOCK, [0])
        bus.write(i, ADDR_MIN_LIMIT, [0, 0, 0xFF, 0x0F])  # full range limits
        bus.write(i, ADDR_HOMING, [0, 0])  # from zero
    time.sleep(0.05)
    actual = bus.positions()
    for i, a in zip(IDS, actual):
        bus.write(i, ADDR_HOMING, encode_offset(a - HALF_TURN))
        bus.write(i, ADDR_LOCK, [1])
    time.sleep(0.05)
    return bus.positions()


def hold(bus):
    """Turn motors on without moving (goal = where it is)."""
    bus.set_goals(bus.positions())
    bus.torque(True)


def record_range(bus, name, seconds):
    lo = bus.positions()
    hi = list(lo)
    t0 = time.time()
    last_hint = 0
    say(f"Move every joint of the {name} slowly from one end to the other.")
    while time.time() - t0 < seconds:
        try:
            p = bus.positions()
        except IOError:
            continue
        lo = [min(a, b) for a, b in zip(lo, p)]
        hi = [max(a, b) for a, b in zip(hi, p)]
        missing = [NAMES[k] for k in range(6) if k != HAND and hi[k] - lo[k] < MIN_SPAN]
        if not missing and time.time() - t0 > 8:
            say("All joints done!")
            break
        if time.time() - last_hint > 8:
            last_hint = time.time()
            if missing:
                say("Still to move: " + ", ".join(missing), wait=False)
        time.sleep(0.05)
    missing = [NAMES[k] for k in range(6) if k != HAND and hi[k] - lo[k] < MIN_SPAN]
    for k in range(6):
        if k != HAND:
            print(f"    {NAMES[k]:10s} {lo[k]:5d} .. {hi[k]:5d}  ({(hi[k] - lo[k]) * 360 / 4096:5.0f} deg)")
    if missing:
        print(f"    WARNING: barely moved: {', '.join(missing)}. Their limits will be narrow.")
    return [[lo[k], hi[k]] for k in range(6)]


def main():
    global VOICE
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--voice", action="store_true", help="timed steps with spoken instructions")
    ap.add_argument("--leader")
    ap.add_argument("--follower")
    ap.add_argument("--range-seconds", type=float, default=40)
    args = ap.parse_args()
    VOICE = args.voice or not sys.stdin.isatty()

    print("Looking for arms...")
    leader, follower = find_arms(args.leader, args.follower)
    if not (leader and follower):
        sys.exit("Need both arms connected and powered.")
    check_power(leader, follower)
    leader.torque(False)
    follower.torque(False)

    say("Let's calibrate both arms from zero. Clear the table around the follower.")

    # 1+2. Middle pose: follower first (it then holds itself), then the leader.
    say(
        "Step 1. Hold the follower in the middle pose: base facing forward, upper arm straight up, "
        "forearm pointing forward like an L, wrist straight, hand half open. Hold it still."
    )
    pause(15, "Hold the follower in the middle pose.")
    f_mid = clear_and_home(follower)
    hold(follower)
    say("Got it! The follower is holding its pose. You can let go.")
    print("    follower middle:", f_mid)

    say("Step 2. Put the leader in exactly the same pose as the follower.")
    pause(15, "Put the leader in the same pose.")
    l_mid = clear_and_home(leader)
    say("Leader saved.")
    print("    leader middle:", l_mid)

    # 3. Range of motion.
    say("Step 3. The leader first.")
    l_range = record_range(leader, "leader", args.range_seconds)
    say("Now the follower. Hold it with one hand: I'm turning its motors off in 3 seconds.")
    time.sleep(3)
    follower.torque(False)
    f_range = record_range(follower, "follower", args.range_seconds)

    # 4. Hands.
    say("Step 4. Let go of the leader's thumb completely.")
    pause(5, "Let go of the leader's thumb.")
    l_open = leader.positions()[HAND]
    say("Now squeeze the leader's thumb all the way and hold it.")
    pause(5, "Squeeze the leader's thumb and hold.")
    l_closed = leader.positions()[HAND]
    say("Open the follower's jaw as wide as it goes, by hand.")
    pause(6, "Open the follower's jaw wide.")
    f_open = follower.positions()[HAND]
    say("Now close the follower's jaw, by hand.")
    pause(6, "Close the follower's jaw.")
    f_closed = follower.positions()[HAND]
    if abs(l_open - l_closed) < 100 or abs(f_open - f_closed) < 100:
        say("A hand barely moved, so I kept the hand settings from before.")
        hand = json.loads(HAND_OUT.read_text()) if HAND_OUT.exists() else None
    else:
        f_closed += GRIP_SQUEEZE * (1 if f_closed > f_open else -1)
        hand = {"leader": {"open": l_open, "closed": l_closed}, "follower": {"open": f_open, "closed": f_closed}}
        HAND_OUT.write_text(json.dumps(hand, indent=2) + "\n")

    cal = {
        "version": 1,
        "created": time.strftime("%Y-%m-%d %H:%M:%S"),
        "middle": HALF_TURN,
        "leader": {"range": l_range},
        "follower": {"range": f_range},
        "hand": hand,
    }
    OUT.write_text(json.dumps(cal, indent=2) + "\n")
    say("All done! Calibration saved. Gently put the follower down, its motors are off.")
    print(f"\nSaved {OUT}")


if __name__ == "__main__":
    main()
