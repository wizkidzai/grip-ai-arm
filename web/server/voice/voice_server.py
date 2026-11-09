#!/usr/bin/env python3
"""Ms. Nova's voice: a natural, human-sounding text-to-speech server that runs on this computer.

Uses Kokoro (open-source neural TTS, Apache-2.0) through kokoro-onnx. Nothing is sent anywhere.

    .venv/bin/python voice_server.py          # http://127.0.0.1:8788

POST /api/voice  {"text": "...", "voice": "af_heart"}  ->  audio/wav
GET  /api/voice/health                                ->  {"ok": true, "voices": [...]}
"""
import io
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("GRIP_VOICE_PORT", "8788"))
MAX_CHARS = 600

# Friendly names for the voices kids can choose from.
VOICES = {
    "af_heart": ("Nova (warm)", "en-us"),
    "af_bella": ("Bella (bright)", "en-us"),
    "af_nicole": ("Nicole (calm)", "en-us"),
    "bf_emma": ("Emma (British)", "en-gb"),
}
DEFAULT_VOICE = "af_heart"

kokoro = Kokoro(os.path.join(HERE, "kokoro-v1.0.onnx"), os.path.join(HERE, "voices-v1.0.bin"))
lock = threading.Lock()  # one synthesis at a time keeps the laptop responsive

# Words the voice would otherwise read oddly.
SAY = [
    (re.compile(r"\bMs\.\s*", re.I), "Miz "),
    (re.compile(r"\bSO-ARM\s*101\b", re.I), "S O arm one oh one"),
    (re.compile(r"\bGRIP\b"), "Grip"),
    (re.compile(r"\bAI\b"), "A I"),
    (re.compile(r"(\d+)\s*°"), r"\1 degrees"),
    (re.compile(r"(\d+)\s*%"), r"\1 percent"),
    (re.compile(r"[*_#`>~]|[\U0001F000-\U0001FAFF☀-➿️]"), ""),  # markdown and emoji
]


def tidy(text: str) -> str:
    for pattern, repl in SAY:
        text = pattern.sub(repl, text)
    return re.sub(r"\s+", " ", text).strip()


class Handler(BaseHTTPRequestHandler):
    def _json(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _origin_ok(self):
        origin = self.headers.get("origin")
        return not origin or re.match(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$", origin)

    def do_GET(self):
        if self.path != "/api/voice/health":
            return self._json(404, {"error": "not found"})
        self._json(200, {"ok": True, "voices": [{"id": k, "name": v[0]} for k, v in VOICES.items()], "default": DEFAULT_VOICE})

    def do_POST(self):
        if self.path != "/api/voice":
            return self._json(404, {"error": "not found"})
        if not self._origin_ok():
            return self._json(403, {"error": "forbidden"})
        try:
            length = int(self.headers.get("content-length", "0"))
            if length > 8192:
                return self._json(413, {"error": "too long"})
            data = json.loads(self.rfile.read(length) or b"{}")
            text = tidy(str(data.get("text", ""))[:MAX_CHARS])
            voice = data.get("voice") if data.get("voice") in VOICES else DEFAULT_VOICE
            if not text:
                return self._json(400, {"error": "no text"})
            with lock:
                samples, rate = kokoro.create(text, voice=voice, speed=1.0, lang=VOICES[voice][1])
            buf = io.BytesIO()
            sf.write(buf, samples, rate, format="WAV", subtype="PCM_16")
            wav = buf.getvalue()
            self.send_response(200)
            self.send_header("content-type", "audio/wav")
            self.send_header("content-length", str(len(wav)))
            self.end_headers()
            self.wfile.write(wav)
        except Exception as e:  # never log what was said
            print("voice error:", type(e).__name__, flush=True)
            self._json(500, {"error": "voice failed"})

    def log_message(self, *args):  # keep the log quiet (and free of what kids said)
        pass


if __name__ == "__main__":
    # Warm up so the first sentence is quick.
    with lock:
        kokoro.create("Hello!", voice=DEFAULT_VOICE, lang="en-us")
    print(f"Ms. Nova's voice on http://127.0.0.1:{PORT}  (Kokoro, local)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
