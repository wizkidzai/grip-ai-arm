import { useCallback, useEffect, useRef, useState } from 'react';
import { VoicePlayer } from '../voice';
import { SceneArt } from './Illustrations';
import { Art, Level, Scene } from './lessons';

/** Which set each scene is filmed on. */
const BACKDROP: Record<Art, 'workshop' | 'stage' | 'lab' | 'map'> = {
  'maya-hello': 'workshop',
  delivery: 'workshop',
  why: 'workshop',
  grip: 'workshop',
  stats: 'stage',
  'role-models': 'stage',
  graduation: 'stage',
  'class-map': 'map',
  joints: 'lab',
  safety: 'lab',
  dial: 'lab',
  poses: 'lab',
  blocks: 'lab',
  loop: 'lab',
  'leader-follower': 'lab',
  demos: 'lab',
  brain: 'lab',
  trials: 'lab',
};

const VOICE_KEY = 'grip.learn.voice';

// The narrator uses Ms. Nova's natural voice (falls back to the browser's best voice).
const narrator = new VoicePlayer();

function speak(text: string, onEnd: () => void): boolean {
  narrator.stop();
  narrator.sayThen(text, onEnd);
  return true;
}

function stopSpeaking() {
  narrator.stop();
}

/**
 * A "video" made of animated scenes. Captions are always on; a voice can read them.
 * Space = play/pause, ← → = previous/next.
 */
export function Cutscene({
  title,
  scenes,
  level,
  onDone,
  doneLabel = 'Continue',
}: {
  title: string;
  scenes: Scene[];
  level: Level;
  onDone: () => void;
  doneLabel?: string;
}) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [voice, setVoiceState] = useState(() => {
    try {
      return localStorage.getItem(VOICE_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [elapsed, setElapsed] = useState(0);
  const [titleCard, setTitleCard] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTitleCard(false), 2200);
    return () => clearTimeout(t);
  }, []);
  const sceneStart = useRef(performance.now());
  const spokeFor = useRef(-1);
  const voiceDone = useRef(false);
  const scene = scenes[i];
  const last = i === scenes.length - 1;

  const extra = [level !== 'explorer' && scene.deeper, level === 'engineer' && scene.engineer].filter(Boolean) as string[];
  const fullText = [scene.caption, ...extra].join(' ');
  const duration = scene.ms ?? Math.max(5500, fullText.length * 65);

  const go = useCallback(
    (n: number) => {
      stopSpeaking();
      spokeFor.current = -1;
      voiceDone.current = false;
      sceneStart.current = performance.now();
      setElapsed(0);
      setI(Math.max(0, Math.min(scenes.length - 1, n)));
    },
    [scenes.length],
  );

  const setVoice = (v: boolean) => {
    setVoiceState(v);
    try {
      localStorage.setItem(VOICE_KEY, v ? '1' : '0');
    } catch {
      /* fine */
    }
    if (!v) stopSpeaking();
    else spokeFor.current = -1;
  };

  // Narrate the scene once when it starts playing.
  useEffect(() => {
    if (!playing || !voice || spokeFor.current === i) return;
    spokeFor.current = i;
    voiceDone.current = false;
    if (!speak(fullText, () => (voiceDone.current = true))) voiceDone.current = true;
  }, [i, playing, voice, fullText]);

  // Clock: advance when the time is up (and the voice has finished).
  useEffect(() => {
    if (!playing) return;
    const start = performance.now() - elapsed;
    sceneStart.current = start;
    const t = setInterval(() => {
      const e = performance.now() - start;
      setElapsed(e);
      // Wait for the voice to finish, but never forever (some computers have no voices).
      const voiceOk = !voice || voiceDone.current || e > duration * 2 + 4000;
      if (e >= duration && voiceOk && !last) go(i + 1);
    }, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, i, voice, duration, last]);

  // Pausing pauses the voice too.
  useEffect(() => {
    if (playing) narrator.resume();
    else narrator.pause();
  }, [playing]);

  // Stop the narrator when the video really closes (not during React's dev-mode remount).
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => !mounted.current && stopSpeaking(), 0);
    };
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault();
      setPlaying((p) => !p);
    } else if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
  };

  return (
    <div className="cutscene" onKeyDown={onKey} tabIndex={-1}>
      <div className="cut-title">
        <span className="cut-badge">▶ {title}</span>
        <button className="btn small" onClick={() => setVoice(!voice)} aria-pressed={voice}>
          {voice ? '🔊 Voice on' : '🔇 Voice off'}
        </button>
      </div>
      <div className={`cut-screen bg-${BACKDROP[scene.art]} ${playing ? '' : 'paused'}`}>
        <div className="set" aria-hidden="true">
          <span className="window" />
          <span className="cloud c1" />
          <span className="cloud c2" />
          <span className="shelf" />
          <span className="spot s1" />
          <span className="spot s2" />
        </div>
        <div className="cut-stage" key={i}>
          <SceneArt art={scene.art} />
        </div>
        <div className="vignette" aria-hidden="true" />
        <p className="cut-subtitle" aria-live="polite">
          {scene.caption}
        </p>
        {titleCard && i === 0 && (
          <div className="title-card" aria-hidden="true">
            <span>GRIP Academy presents</span>
            <strong>{title}</strong>
          </div>
        )}
      </div>
      <div className="cut-progress" aria-hidden="true">
        {scenes.map((_, k) => (
          <span key={k} className="seg">
            <span
              className="fill"
              style={{ width: k < i ? '100%' : k > i ? '0%' : `${Math.min(100, (elapsed / duration) * 100)}%` }}
            />
          </span>
        ))}
      </div>
      {extra.length > 0 && (
        <div className="cut-caption">
          {extra.map((x) => (
            <p key={x} className="deeper">
              🔍 <strong>Go deeper:</strong> {x}
            </p>
          ))}
        </div>
      )}
      <div className="row cut-controls">
        <button className="btn" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous scene">
          ⏮
        </button>
        <button className="btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        {!last ? (
          <button className="btn" onClick={() => go(i + 1)} aria-label="Next scene">
            ⏭
          </button>
        ) : null}
        <span className="hint">
          Scene {i + 1} of {scenes.length}
        </span>
        <span className="spacer" />
        {last ? (
          <button
            className="btn primary big"
            onClick={() => {
              stopSpeaking();
              onDone();
            }}
          >
            {doneLabel} →
          </button>
        ) : (
          <button
            className="btn link"
            onClick={() => {
              stopSpeaking();
              onDone();
            }}
          >
            Skip video
          </button>
        )}
      </div>
    </div>
  );
}
