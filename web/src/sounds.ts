/** Little sounds for the "play sound" block, made by the browser (no audio files). */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(a: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = 'sine', endFreq?: number, gain = 0.18) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + start);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, a.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.05);
}

export function playSound(name: string) {
  const a = audio();
  if (!a) return;
  switch (name) {
    case 'beep':
      tone(a, 880, 0, 0.18, 'square', undefined, 0.08);
      break;
    case 'cheer': // a happy rising arpeggio
      [523, 659, 784, 1047].forEach((f, i) => tone(a, f, i * 0.09, 0.22, 'triangle'));
      break;
    case 'boing':
      tone(a, 180, 0, 0.45, 'sine', 620);
      break;
    case 'whoosh': {
      const len = Math.floor(a.sampleRate * 0.5);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len);
      const src = a.createBufferSource();
      const f = a.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(400, a.currentTime);
      f.frequency.exponentialRampToValueAtTime(3000, a.currentTime + 0.5);
      const g = a.createGain();
      g.gain.value = 0.25;
      src.buffer = buf;
      src.connect(f).connect(g).connect(a.destination);
      src.start();
      break;
    }
  }
}
