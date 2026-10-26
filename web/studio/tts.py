#!/usr/bin/env python3
"""Make the voices for the how-to videos: one WAV per line + a lip-sync envelope.

    ../server/voice/.venv/bin/python tts.py      (run from web/studio)

Writes build/<video>_<n>.wav and build/voices.json ({id: [{speaker, text, ms, envelope}]}).
"""
import json
import os
import re

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE_DIR = os.path.join(HERE, "..", "server", "voice")
OUT = os.path.join(HERE, "build")
FRAME = 0.04  # 25 envelope values per second
os.makedirs(OUT, exist_ok=True)

spec = json.load(open(os.path.join(HERE, "videos.json")))
kokoro = Kokoro(os.path.join(VOICE_DIR, "kokoro-v1.0.onnx"), os.path.join(VOICE_DIR, "voices-v1.0.bin"))


def spoken(text):
    text = re.sub(r"\bMs\.\s*", "Miz ", text)
    return text.replace("GRIP", "Grip")


result = {}
for video in spec["videos"]:
    lines = []
    for n, line in enumerate(video["lines"]):
        speaker = "nova" if "nova" in line else "maya"
        text = line[speaker]
        samples, rate = kokoro.create(spoken(text), voice=spec["voices"][speaker], speed=1.0 if speaker == "nova" else 1.05, lang="en-us")
        path = os.path.join(OUT, f"{video['id']}_{n}.wav")
        sf.write(path, samples, rate)
        # Lip sync: loudness per 40 ms, scaled so normal speech opens the mouth well.
        hop = int(rate * FRAME)
        rms = np.array([np.sqrt(np.mean(samples[i : i + hop] ** 2)) for i in range(0, len(samples), hop)])
        top = np.percentile(rms, 92) or 1.0
        env = np.clip(rms / top, 0, 1)
        env[env < 0.12] = 0
        lines.append({"speaker": speaker, "text": text, "ms": int(len(samples) / rate * 1000), "envelope": [round(float(v), 2) for v in env]})
        print(f"{video['id']} #{n} {speaker}: {lines[-1]['ms'] / 1000:.1f}s")
    result[video["id"]] = lines

json.dump(result, open(os.path.join(OUT, "voices.json"), "w"))
print("done")
