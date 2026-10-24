#!/usr/bin/env python3
"""Change one Feetech STS3215 motor's ID on an SO-ARM101 bus.

Use when two motors share an ID (e.g. the shoulder was left at factory ID 1).
Physically make sure only ONE motor with the old ID is on the bus first.

    python3 tools/fix_motor_id.py --port /dev/ttyACM0 --old 1 --new 2

Needs: pip install pyserial
"""
import argparse
import atexit
import sys
import time

import serial

ADDR_ID = 5
ADDR_LOCK = 55  # 0 = EEPROM writable, 1 = locked


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


def is_clean_reply(data, motor_id):
    if len(data) < 6 or data[:2] != b"\xff\xff" or data[2] != motor_id:
        return False
    length = data[3]
    frame = data[2 : 4 + length]
    return len(frame) == length + 2 and (~sum(frame[:-1])) & 0xFF == frame[-1]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", default="/dev/ttyACM0")
    ap.add_argument("--old", type=int, required=True)
    ap.add_argument("--new", type=int, required=True)
    ap.add_argument("--yes", action="store_true", help="do not ask for confirmation")
    args = ap.parse_args()
    if not (0 <= args.old <= 252 and 1 <= args.new <= 252) or args.old == args.new:
        sys.exit("IDs must be different and between 1 and 252.")

    bus = serial.Serial(args.port, 1_000_000, timeout=0.03)
    atexit.register(restore_tty, bus)

    def ask(motor_id, instr, params=()):
        bus.reset_input_buffer()
        bus.write(packet(motor_id, instr, params))
        time.sleep(0.015)
        return bus.read(64)

    def ping(motor_id):
        return is_clean_reply(ask(motor_id, 0x01), motor_id)

    print("Scanning IDs 1-12...")
    found = {i: sum(ping(i) for _ in range(5)) for i in range(1, 13)}
    print("  clean replies (out of 5):", {k: v for k, v in found.items() if v})

    if found[args.old] < 5:
        sys.exit(
            f"ID {args.old} is not answering cleanly ({found[args.old]}/5). There is probably still more than one "
            f"motor with ID {args.old} on the bus. Unplug the other one and try again."
        )
    if found[args.new]:
        sys.exit(f"A motor already uses ID {args.new}. Nothing changed.")

    if not args.yes:
        reply = input(f"Change the motor with ID {args.old} to ID {args.new}? [y/N] ")
        if reply.strip().lower() != "y":
            sys.exit("Nothing changed.")

    ask(args.old, 0x03, (40, 0))  # torque off
    ask(args.old, 0x03, (ADDR_LOCK, 0))  # unlock EEPROM
    ask(args.old, 0x03, (ADDR_ID, args.new))  # reply comes from the new ID, ignore it
    time.sleep(0.05)
    ask(args.new, 0x03, (ADDR_LOCK, 1))  # lock EEPROM again

    if all(ping(args.new) for _ in range(5)) and not ping(args.old):
        print(f"Done! The motor is now ID {args.new}.")
    else:
        sys.exit("Could not confirm the change. Power-cycle the arm and run the scan again.")


if __name__ == "__main__":
    main()
