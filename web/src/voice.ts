/**
 * Ms. Nova's voice. Uses the natural voice server on this computer (Kokoro, /api/voice)
 * and falls back to the browser's own voice when it isn't running (e.g. on the public site).
 *
 * Sentences are queued; while one plays, the next is already being made, so speech flows.
 */

export const VOICE_NAME_KEY = 'grip.voiceName';

export interface VoiceOption {
  id: string;
  name: string;
}

let health: Promise<{ voices: VoiceOption[]; default: string } | null> | null = null;

/** Which natural voices exist (null = voice server not running). */
export function naturalVoices() {
  health ??= fetch('/api/voice/health')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return health;
}

export function savedVoice(): string | null {
  try {
    return localStorage.getItem(VOICE_NAME_KEY);
  } catch {
    return null;
  }
}

export function saveVoice(id: string) {
  try {
    localStorage.setItem(VOICE_NAME_KEY, id);
  } catch {
    /* fine */
  }
}

/** The least robotic voice the browser offers (used only when the voice server is off). */
function bestBrowserVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online/i.test(v.name) ? 40 : 0) +
    (/google|microsoft|apple|samantha|aria|jenny|ava|allison|zira/i.test(v.name) ? 20 : 0) +
    (/female|woman|samantha|aria|jenny|ava|zira|allison|susan/i.test(v.name) ? 5 : 0) -
    (/espeak|mbrola|robot/i.test(v.name) ? 50 : 0);
  return en.sort((a, b) => score(b) - score(a))[0];
}

type Item = { text: string; audio: Promise<Blob | null> };

export class VoicePlayer {
  private queue: Item[] = [];
  private playing = false;
  private current: HTMLAudioElement | null = null;
  private generation = 0;
  /** Chosen voice; null = whatever was last picked in the call (saved in this browser). */
  voice: string | null = null;

  constructor(private onSpeakingChange: (speaking: boolean) => void = () => {}) {}

  /** Add a sentence to say. Its audio starts being made right away. */
  say(text: string) {
    const clean = text.trim();
    if (!clean) return;
    this.queue.push({ text: clean, audio: this.make(clean) });
    if (!this.playing) void this.run();
  }

  /** Say something and call `onEnd` when it has been spoken (used by the story videos). */
  sayThen(text: string, onEnd: () => void) {
    this.say(text);
    const gen = this.generation;
    const check = () => {
      if (gen !== this.generation) return;
      if (!this.playing && !this.queue.length) onEnd();
      else setTimeout(check, 150);
    };
    setTimeout(check, 150);
  }

  stop() {
    this.generation++;
    this.queue = [];
    this.current?.pause();
    this.current = null;
    window.speechSynthesis?.cancel();
    this.setPlaying(false);
  }

  pause() {
    this.current?.pause();
    window.speechSynthesis?.pause();
  }

  resume() {
    void this.current?.play().catch(() => undefined);
    window.speechSynthesis?.resume();
  }

  private setPlaying(p: boolean) {
    if (this.playing !== p) {
      this.playing = p;
      this.onSpeakingChange(p);
    }
  }

  private async make(text: string): Promise<Blob | null> {
    if (!(await naturalVoices())) return null;
    try {
      const r = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, voice: this.voice ?? savedVoice() ?? undefined }),
      });
      return r.ok ? await r.blob() : null;
    } catch {
      return null;
    }
  }

  private async run() {
    const gen = this.generation;
    this.setPlaying(true);
    while (this.queue.length && gen === this.generation) {
      const item = this.queue.shift()!;
      const blob = await item.audio;
      if (gen !== this.generation) return;
      if (blob) await this.playBlob(blob, gen);
      else await this.browserSay(item.text, gen);
    }
    if (gen === this.generation) this.setPlaying(false);
  }

  private playBlob(blob: Blob, gen: number) {
    return new Promise<void>((resolve) => {
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      this.current = a;
      const done = () => {
        URL.revokeObjectURL(url);
        if (this.current === a) this.current = null;
        resolve();
      };
      a.onended = done;
      a.onerror = done;
      a.play().catch(done);
      // If stopped meanwhile, the generation check in run() ends the loop.
      if (gen !== this.generation) a.pause();
    });
  }

  private browserSay(text: string, gen: number) {
    return new Promise<void>((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth || gen !== this.generation) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      const v = bestBrowserVoice();
      if (v) u.voice = v;
      u.rate = 0.98;
      u.pitch = 1.05;
      u.onend = u.onerror = () => resolve();
      synth.speak(u);
    });
  }
}
