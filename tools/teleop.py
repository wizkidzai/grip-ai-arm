#!/usr/bin/env python3
"""Leader -> follower copying for the SO-ARM101, without the web app.

Move the leader arm by hand; the follower copies the same movements.
It copies *changes* from where both arms start, so no calibration is needed
and nothing jumps when it starts.

    python3 tools/teleop.py                  # auto-detects the arms, Ctrl+C to stop
    python3 tools/teleop.py --seconds 60     # stop by itself after 60 s
    python3 tools/teleop.py --relax          # just turn the follower's motors off
    python3 tools/teleop.py --leader /dev/ttyACM0 --follower /dev/ttyACM1   # say which is which
    python3 tools/teleop.py --calibrate-hand # measure trigger + jaw open/closed (10 seconds)

The hand copies directly (trigger let go = jaw open, squeezed = jaw closed) using
tools/hand_calibration.json, because on the SO-101 kit the leader's trigger and the
follower's jaw motors turn in opposite directions. Without that file the hand copies
changes like the other joints.

The follower (gripper jaws) must be on the 12 V adapter, the leader (trigger
handle) on the 5 V one. The script refuses to run if that looks swapped.

On stop, the follower holds its position (motors stay on so it doesn't drop).
Needs: pip install pyserial
"""
import argparse
import atexit
import glob
import json
import signal
import sys
import time
from pathlib import Path

import serial

IDS = [1, 2, 3, 4, 5, 6]
NAMES = ["base", "shoulder", "elbow", "wrist tilt", "wrist spin", "hand"]
ADDR_MIN_LIMIT, ADDR_TORQUE, ADDR_GOAL, ADDR_LOCK, ADDR_POS, ADDR_VOLT = 9, 40, 42, 55, 56, 62


def restore_tty(ser):
    """pyserial leaves the port with VMIN=0. Chrome (WebSerial) then reads "end of file" and
    reports "The device has been lost", so put back Linux's default (VMIN=1, VTIME=0)."""
    try:
        import termios

        attrs = termios.tcgetattr(ser.fd)
        attrs[6][termios.VMIN] = 1
        attrs[6][termios.VTIME] = 0
        termios.tcsetattr(ser.fd, termios.TCSANOW, attrs)
    except Exception:
        pass


def packet(motor_id, instr, params=()):
    body = [motor_id, len(params) + 2, instr, *params]
    return bytes([0xFF, 0xFF, *body, (~sum(body)) & 0xFF])


class Bus:
    def __init__(self, port):
        self.port = port
        self.s = serial.Serial(port, 1_000_000, timeout=0.02)
        atexit.register(restore_tty, self.s)

    def ask(self, motor_id, instr, params=(), reply=True):
        self.s.reset_input_buffer()
        self.s.write(packet(motor_id, instr, params))
        if not reply:
            return None
        data = self.s.read(6)
        if len(data) < 4 or data[:3] != bytes([0xFF, 0xFF, motor_id]):
            return None
        data += self.s.read(4 + data[3] - len(data))
        frame = data[2:]
        if len(frame) != data[3] + 2 or (~sum(frame[:-1])) & 0xFF != frame[-1]:
            return None
        return frame[3:-1]

    def read(self, motor_id, addr, n, tries=3):
        for _ in range(tries):
            r = self.ask(motor_id, 0x02, (addr, n))
            if r is not None and len(r) == n:
                return r
        raise IOError(f"motor {motor_id} on {self.port} did not answer")

    def write(self, motor_id, addr, data):
        self.ask(motor_id, 0x03, (addr, *data))

    def positions(self):
        out = []
        for i in IDS:
            r = self.read(i, ADDR_POS, 2)
            v = r[0] | (r[1] << 8)
            out.append(-(v & 0x7FFF) if v & 0x8000 else v)
        return out

    def voltage(self):
        return self.read(IDS[0], ADDR_VOLT, 1)[0] / 10

    def torque(self, on):
        for i in IDS:
            self.write(i, ADDR_TORQUE, [1 if on else 0])

    def set_goals(self, goals):
        params = [ADDR_GOAL, 2]
        for i, g in zip(IDS, goals):
            g = max(0, min(4095, int(round(g))))
            params += [i, g & 0xFF, g >> 8]
        self.ask(0xFE, 0x83, params, reply=False)  # sync write, no reply

    def full_range_limits(self):
        """Old LeRobot limits stored in the motors can block moves; reset to 0-4095."""
        fixed = 0
        for i in IDS:
            r = self.read(i, ADDR_MIN_LIMIT, 4)
            if (r[0] | r[1] << 8, r[2] | r[3] << 8) != (0, 4095):
                self.write(i, ADDR_TORQUE, [0])
                self.write(i, ADDR_LOCK, [0])
                self.write(i, ADDR_MIN_LIMIT, [0, 0, 0xFF, 0x0F])
                self.write(i, ADDR_LOCK, [1])
                fixed += 1
        return fixed


HAND_FILE = Path(__file__).with_name("hand_calibration.json")
CAL_FILE = Path(__file__).with_name("calibration.json")  # written by tools/calibrate.py
HAND_CATCH_TICKS = 80  # the thumb "catches" the jaw within this distance
HAND_MOVE_TICKS = 150  # ...or once the thumb moves this much (~13 deg) from where it started
STUCK_TICKS = 200  # a joint this far behind its goal is blocked (~18 deg)
RANGE_MARGIN = 30  # ticks (~3 deg) to stay away from each joint's measured end
SOFT_START_S, SOFT_START_SPEED = 3.0, 30.0  # deg/s while the follower first goes to the leader's pose


def load_ranges():
    """Follower joint ranges from tools/calibrate.py; with them we copy the real pose."""
    try:
        cal = json.loads(CAL_FILE.read_text())
        rng = cal["follower"]["range"]
        if len(rng) == 6 and all(hi - lo >= 0 for lo, hi in rng):
            return rng
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return None
HAND = 5  # index of the gripper / trigger


def load_hand():
    try:
        h = json.loads(HAND_FILE.read_text())
        for arm in ("leader", "follower"):
            if abs(h[arm]["open"] - h[arm]["closed"]) < 100:
                return None
        return h
    except (OSError, ValueError, KeyError, TypeError):
        return None


def hand_target(h, leader_raw):
    """Trigger let go -> jaw open, trigger squeezed -> jaw closed (whatever each motor's direction)."""
    lo, lc = h["leader"]["open"], h["leader"]["closed"]
    fo, fc = h["follower"]["open"], h["follower"]["closed"]
    s = max(0.0, min(1.0, (leader_raw - lo) / (lc - lo)))  # 0 = let go, 1 = squeezed
    return fo + s * (fc - fo)


def calibrate_hand(leader, follower):
    leader.torque(False)
    follower.torque(False)
    input("1) Let go of the leader's trigger, and open the follower's jaw WIDE by hand. Then press Enter.")
    lo, fo = leader.positions()[HAND], follower.positions()[HAND]
    input("2) Squeeze the leader's trigger fully, and close the follower's jaw by hand. Then press Enter.")
    lc, fc = leader.positions()[HAND], follower.positions()[HAND]
    if abs(lo - lc) < 100 or abs(fo - fc) < 100:
        sys.exit("A hand barely moved. Run --calibrate-hand again and move them all the way.")
    h = {"leader": {"open": lo, "closed": lc}, "follower": {"open": fo, "closed": fc}}
    HAND_FILE.write_text(json.dumps(h, indent=2) + "\n")
    same = (lc - lo > 0) == (fc - fo > 0)
    print(f"Saved {HAND_FILE.name}: {h}")
    print("Trigger and jaw motors turn the " + ("same way." if same else "opposite way (handled)."))


LEADER_MAX_V = 9.0  # leader motors are low-voltage (~5-7.4 V); 12 V can damage them
FOLLOWER_MIN_V = 9.0  # follower motors need the 12 V adapter to move


def check_power(leader, follower):
    """Stop before moving anything if the power adapters look swapped."""
    lv, fv = leader.voltage(), follower.voltage()
    if lv > LEADER_MAX_V:
        sys.exit(
            f"STOP: the leader ({leader.port}) gets {lv:.1f} V. Its motors are low-voltage.\n"
            "Unplug its power now. The 12 V adapter goes on the follower (gripper jaws),\n"
            "the 5 V adapter on the leader (trigger handle). Or you swapped --leader/--follower."
        )
    if fv < FOLLOWER_MIN_V:
        sys.exit(
            f"The follower ({follower.port}) only gets {fv:.1f} V, too little for its 12 V motors.\n"
            "Plug the 12 V adapter into the follower (gripper jaws), or check --leader/--follower."
        )


def find_arms(leader_port=None, follower_port=None):
    if leader_port or follower_port:
        if not (leader_port and follower_port):
            sys.exit("Give both --leader and --follower, or neither.")
        return Bus(leader_port), Bus(follower_port)
    leader = follower = None
    for port in sorted(glob.glob("/dev/ttyACM*") + glob.glob("/dev/ttyUSB*")):
        try:
            bus = Bus(port)
        except serial.SerialException as e:
            print(f"  {port}: can't open ({'in use by another program, e.g. Chrome' if 'busy' in str(e) else e})")
            continue
        try:
            v = bus.voltage()
        except IOError:
            print(f"  {port}: motors not answering (power on?)")
            continue
        role = "follower" if v > 8 else "leader"
        print(f"  {port}: {role} ({v:.1f} V)")
        if role == "follower":
            follower = bus
        else:
            leader = bus
    return leader, follower


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seconds", type=float, default=0, help="stop after this many seconds (0 = until Ctrl+C)")
    ap.add_argument("--speed", type=float, default=120, help="max speed in degrees per second (default 120)")
    ap.add_argument("--relax", action="store_true", help="turn the follower's motors off and exit")
    ap.add_argument("--leader", help="leader's port, e.g. /dev/ttyACM0 (default: auto-detect by voltage)")
    ap.add_argument("--follower", help="follower's port, e.g. /dev/ttyACM1")
    ap.add_argument("--debug-hand", action="store_true", help="print trigger / jaw goal / jaw actual 4x per second")
    ap.add_argument("--calibrate-hand", action="store_true", help="measure trigger/jaw open and closed, then exit")
    args = ap.parse_args()

    print("Looking for arms...")
    leader, follower = find_arms(args.leader, args.follower)
    if not follower:
        sys.exit("No follower arm found (the 12 V one). Is its power on and USB free?")
    if args.relax:
        follower.torque(False)
        sys.exit("Follower motors are off.")
    if not leader:
        sys.exit("No leader arm found (the 5 V one). Is its power on and USB free?")

    check_power(leader, follower)
    if args.calibrate_hand:
        calibrate_hand(leader, follower)
        return
    hand = load_hand()
    ranges = load_ranges()
    print("Hand: " + ("copies directly (trigger -> jaw)" if hand else "copies changes (run --calibrate-hand for best results)"))
    print("Joints: " + ("copy the leader's real pose (tools/calibration.json)" if ranges else "copy changes from where both arms start"))
    fixed = follower.full_range_limits()
    if fixed:
        print(f"Reset old position limits on {fixed} follower motor(s).")
    leader.torque(False)  # the leader must stay floppy so you can move it

    lead0 = leader.positions()
    foll0 = follower.positions()
    goal = list(foll0)
    follower.set_goals(goal)  # hold where it is, then turn on: no jump
    follower.torque(True)

    hz = 50
    step = args.speed / 360 * 4096 / hz  # max ticks per update
    stop = False

    def on_signal(*_):
        nonlocal stop
        stop = True

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)
    print(f"Copying! Move the leader. Speed limit {args.speed:.0f} deg/s. Ctrl+C to stop.")

    start = time.time()
    hand_caught, prev_want = False, None
    loops = 0
    if hand:
        print("Squeeze the leader's thumb to take control of the hand (it won't open by itself).")
    last_print = 0
    misses = 0
    while not stop and (not args.seconds or time.time() - start < args.seconds):
        t = time.time()
        try:
            lead = leader.positions()
            misses = 0
        except IOError:
            misses += 1  # keep going; the follower just waits this round
            if misses % 50 == 1:
                print("  (leader missed a reading, still going)")
            time.sleep(1 / hz)
            continue
        for k in range(6):
            if k == HAND and hand:
                # Pick-up: the jaw stays where it is (never opens by itself at the start)
                # until the thumb's position reaches it; then it copies the thumb.
                want = hand_target(hand, lead[k])
                if not hand_caught:
                    crossed = prev_want is not None and (prev_want - foll0[k]) * (want - foll0[k]) <= 0
                    moved = abs(lead[k] - lead0[k]) > HAND_MOVE_TICKS  # thumb clearly moved
                    if crossed or moved or abs(want - foll0[k]) < HAND_CATCH_TICKS:
                        hand_caught = True
                        print("  (hand caught: the jaw now copies the thumb)")
                prev_want = want
                target = want if hand_caught else foll0[k]
            elif ranges:
                lo, hi = ranges[k]
                target = max(lo + RANGE_MARGIN, min(hi - RANGE_MARGIN, lead[k])) if hi - lo > 2 * RANGE_MARGIN else goal[k]
            else:
                target = foll0[k] + (lead[k] - lead0[k])
            target = max(0, min(4095, target))
            limit = step if t - start > SOFT_START_S else SOFT_START_SPEED / 360 * 4096 / hz
            goal[k] += max(-limit, min(limit, target - goal[k]))
        follower.set_goals(goal)
        # No dead zone: if a follower joint is blocked (it can't go as far as the leader),
        # forget the extra so it comes back as soon as the leader turns back.
        loops += 1
        if not ranges and loops % 5 == 0:
            try:
                actual = follower.positions()
                for k in range(6):
                    if k != HAND and abs(goal[k] - actual[k]) > STUCK_TICKS:
                        foll0[k] += actual[k] - goal[k]
                        goal[k] = actual[k]
            except IOError:
                pass
        if args.debug_hand and t - last_print > 0.25:
            last_print = t
            try:
                jaw = follower.positions()[HAND]
            except IOError:
                jaw = -1
            squeeze = ""
            if hand:
                lo, lc = hand["leader"]["open"], hand["leader"]["closed"]
                squeeze = f"squeezed {100 * (lead[HAND] - lo) / (lc - lo):4.0f}%  "
            print(f"  {t - start:5.1f}s trigger {lead[HAND]:5d} {squeeze}| jaw goal {goal[HAND]:6.0f} | jaw actual {jaw:5d}")
        elif not args.debug_hand and t - last_print > 1:
            last_print = t
            print("  " + "  ".join(f"{n}:{(lead[k] - lead0[k]) * 360 / 4096:+5.0f}°" for k, n in enumerate(NAMES)))
        time.sleep(max(0, 1 / hz - (time.time() - t)))

    try:
        follower.set_goals(follower.positions())  # hold still where it is
    except IOError:
        pass
    print("Stopped. The follower is holding its position. Run with --relax to turn its motors off.")


if __name__ == "__main__":
    main()
