import { useCallback, useEffect, useRef, useState } from 'react';
import { ChallengeSheet } from './ChallengeSheet';
import { Challenge, ChallengeProgress, KIND_LABEL, loadChallenges, nextChallenge, saveChallenges } from './challenges';
import { TeacherAvatar } from './TeacherAvatar';
import { DistractingTab, closeTab, distractingTabs, helperInstalled, siteList } from './focusGuard';
import { VoiceOption, VoicePlayer, naturalVoices, saveVoice, savedVoice } from '../voice';
import './teacher.css';

/** What Ms. Nova can "see" of the app (no personal information). */
export interface AppContext {
  level: string;
  tab: string;
  leader: string;
  follower: string;
  mode: string;
  mission: string;
  demos: number;
  brains: number;
  lastMessage: string;
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const CONSENT_KEY = 'grip.teacher.consent';
const VOICE_KEY = 'grip.teacher.voice';
const greetingFor = (c: Challenge) =>
  `Hi, I'm Ms. Nova, your AI robotics teacher! Today's challenge is ${c.title}. ${c.goal} Your challenge sheet has the steps. Tick each one as you go, and ask me if you get stuck!`;
const congratsFor = (c: Challenge) =>
  `Amazing work! You finished ${c.title} and earned the ${c.badge.replace(/^\S+\s/, '')} badge. Next class I'll have a brand new challenge for you!`;
const SUGGESTIONS = ['What is physical AI?', 'How do I connect the arms?', 'Teach me about the 6 joints', 'Give me a fun challenge!', "I'm stuck, help!"];

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function getRecognizer(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

/** Streams the teacher's reply from the local teacher server (Server-Sent Events). */
async function askTeacher(messages: Msg[], context: AppContext & { challenge?: string }, onText: (t: string) => void, signal: AbortSignal) {
  const res = await fetch('/api/teacher/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, context }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Ms. Nova isn't online right now.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      const type = /^event: (.*)$/m.exec(chunk)?.[1];
      const data = /^data: (.*)$/m.exec(chunk)?.[1];
      if (!type || !data) continue;
      const parsed = JSON.parse(data) as { text?: string; error?: string };
      if (type === 'text' && parsed.text) onText(parsed.text);
      if (type === 'error') throw new Error(parsed.error ?? 'Something went wrong.');
    }
  }
}

export function TeacherCall({ context, onLeave }: { context: AppContext; onLeave: () => void }) {
  const [consent, setConsent] = useState(() => {
    try {
      return localStorage.getItem(CONSENT_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [online, setOnline] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<'local' | 'claude' | 'none' | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  // A new challenge sheet for every class (handed out when the class starts).
  const [progress, setProgressState] = useState<ChallengeProgress>(loadChallenges);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [panel, setPanel] = useState<'sheet' | 'chat'>('sheet');
  const [unread, setUnread] = useState(false);
  const setProgress = (p: ChallengeProgress) => {
    setProgressState(p);
    saveChallenges(p);
  };
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoiceState] = useState(() => {
    try {
      return localStorage.getItem(VOICE_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [seconds, setSeconds] = useState(0);
  const [chatOpen, setChatOpen] = useState(true);
  /** "Try robot": the call shrinks to a small window so the app can be used during the class. */
  const [mini, setMini] = useState(false);
  // Natural voice (local Kokoro server), falling back to the browser's best voice.
  const player = useRef<VoicePlayer>();
  player.current ??= new VoicePlayer((on) => setSpeaking(on));
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceName, setVoiceName] = useState<string>(() => savedVoice() ?? 'af_heart');
  useEffect(() => {
    naturalVoices().then((h) => {
      if (!h) return;
      setVoices(h.voices);
      if (!savedVoice()) setVoiceName(h.default);
    });
  }, []);
  const chooseVoice = (id: string) => {
    setVoiceName(id);
    saveVoice(id);
    player.current!.voice = id;
    player.current!.stop();
    player.current!.say("Hi! This is how I'll sound.");
  };
  const sentenceBuf = useRef('');
  const abort = useRef<AbortController | null>(null);
  const recog = useRef<SpeechRecognitionLike | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const ctxRef = useRef(context);
  ctxRef.current = context;
  const canListen = !!getRecognizer();

  // Call timer
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Is the teacher server running and set up?
  useEffect(() => {
    fetch('/api/teacher/health')
      .then((r) => r.json())
      .then((h: { ready?: boolean; provider?: 'local' | 'claude' | 'none' }) => {
        setOnline(!!h.ready);
        setProvider(h.provider ?? null);
      })
      .catch(() => setOnline(false));
  }, []);

  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [messages, interim]);

  // ---- voice out: speak finished sentences while the reply is still streaming ----
  const speakNow = useCallback(
    (text: string) => {
      if (voice) player.current!.say(text);
    },
    [voice],
  );

  const stopSpeaking = () => player.current!.stop();

  const feedSpeech = (delta: string, final = false) => {
    sentenceBuf.current += delta;
    const re = /^(.*?[.!?])(\s+|$)/s;
    let m;
    while ((m = re.exec(sentenceBuf.current)) && (m[2] || final)) {
      speakNow(m[1]);
      sentenceBuf.current = sentenceBuf.current.slice(m[0].length);
    }
    if (final && sentenceBuf.current.trim()) {
      speakNow(sentenceBuf.current);
      sentenceBuf.current = '';
    }
  };

  // When the class starts: hand out the next challenge sheet, then greet.
  const greeted = useRef(false);
  useEffect(() => {
    if (!consent || greeted.current) return;
    greeted.current = true;
    const p = loadChallenges();
    const c = nextChallenge(p);
    setProgress({ ...p, current: c.id, classes: p.classes + 1, ticks: { ...p.ticks, [c.id]: p.done.includes(c.id) ? p.ticks[c.id] ?? [] : [] } });
    setChallenge(c);
    const hello = greetingFor(c);
    setMessages([{ role: 'assistant', content: hello }]);
    feedSpeech(hello, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consent]);

  const ticks = challenge ? progress.ticks[challenge.id] ?? [] : [];
  const challengeDone = !!challenge && progress.done.includes(challenge.id);
  const showBonus = context.level === 'builder' || context.level === 'engineer';
  const toggleTick = (i: number) => {
    if (!challenge) return;
    const now = ticks.includes(i) ? ticks.filter((t) => t !== i) : [...ticks, i];
    setProgress({ ...progress, ticks: { ...progress.ticks, [challenge.id]: now } });
  };
  // ---- focus: game/video tabs ----
  const [distractions, setDistractions] = useState<DistractingTab[]>([]);
  const [helper, setHelper] = useState<boolean | null>(null);
  const nagged = useRef<string>(''); // sites already mentioned out loud
  const ignored = useRef<Set<number>>(new Set()); // "it's for class"
  const lastWelcome = useRef(0);
  const sayAloud = (msg: string) => {
    setMessages((m) => [...m, { role: 'assistant', content: msg }]);
    feedSpeech(msg, true);
  };
  useEffect(() => {
    if (!consent) return;
    let alive = true;
    const check = async () => {
      const tabs = (await distractingTabs()).filter((t) => !ignored.current.has(t.id));
      if (!alive) return;
      setDistractions(tabs);
      const key = [...new Set(tabs.map((t) => t.site))].sort().join(',');
      if (tabs.length && key !== nagged.current) {
        const names = siteList(tabs.map((t) => t.site));
        sayAloud(
          `I see ${tabs.length === 1 ? `a ${names} tab` : `${names} tabs`} open. Please close the ${names} tab${tabs.length > 1 ? 's' : ''} so we can focus on Pip!`,
        );
      }
      nagged.current = key;
    };
    void helperInstalled().then((ok) => {
      if (!alive) return;
      setHelper(ok);
      if (ok) void check();
    });
    const t = setInterval(() => helper !== false && void check(), 20000);
    // Without the helper we can't see other tabs; remind gently when the learner comes back.
    const onVisible = () => {
      if (document.hidden) return;
      if (helper) return void check();
      if (Date.now() - lastWelcome.current < 120000) return;
      lastWelcome.current = Date.now();
      sayAloud('Welcome back! If you have game or video tabs open, please close them so we can focus on Pip.');
    };
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (Date.now() - hiddenAt > 5000) onVisible();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consent, helper]);
  const closeDistraction = async (tab: DistractingTab) => {
    const ok = await closeTab(tab.id);
    setDistractions((d) => d.filter((x) => x.id !== tab.id));
    if (ok && distractions.length === 1) sayAloud(`Thank you! Now let's get back to the challenge.`);
  };
  const focusBar = distractions.length > 0 && (
    <div className="focus-bar" role="alert">
      <span>
        🎮 Ms. Nova: please close the <strong>{siteList(distractions.map((d) => d.site))}</strong>{' '}
        tab{distractions.length > 1 ? 's' : ''}.
      </span>
      {distractions.map((d) => (
        <button key={d.id} className="btn small primary" onClick={() => closeDistraction(d)}>
          Close {d.site} tab
        </button>
      ))}
      <button
        className="btn small"
        onClick={() => {
          distractions.forEach((d) => ignored.current.add(d.id));
          setDistractions([]);
        }}
        title="A grown-up says this tab is needed for the class"
      >
        It's for class
      </button>
    </div>
  );

  const finishChallenge = () => {
    if (!challenge || challengeDone) return;
    setProgress({ ...progress, done: [...progress.done, challenge.id] });
    const msg = congratsFor(challenge);
    setMessages((m) => [...m, { role: 'assistant', content: msg }]);
    stopSpeaking();
    feedSpeech(msg, true);
  };
  /** What Ms. Nova is told about today's sheet (so she coaches the right step). */
  const challengeNote = challenge
    ? `"${challenge.title}" (a ${KIND_LABEL[challenge.kind].replace(/^\S+\s/, '')} challenge${challenge.tab ? `, start in the ${challenge.tab} tab` : ', no robot needed'}). Goal: ${challenge.goal} ${
        challenge.quiz ? `It is a quiz: the learner answers on the sheet. Do not tell them the answers; give hints. ` : ''
      }Steps: ${challenge.steps
        .map((st, i) => `${i + 1}) ${st} [${ticks.includes(i) ? 'done' : 'to do'}]`)
        .join(' ')}${challengeDone ? ' The learner has finished it.' : ''}`
    : '';

  // Stop everything when the call really closes. React's development mode unmounts and
  // remounts once on purpose; wait a tick so that fake unmount doesn't cut off the greeting.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (mounted.current) return;
        abort.current?.abort();
        recog.current?.stop();
        player.current?.stop();
      }, 0);
    };
  }, []);

  const send = async (text: string) => {
    const content = text.trim().slice(0, 600);
    if (!content || streaming) return;
    setError(null);
    setDraft('');
    setInterim('');
    stopSpeaking();
    const history: Msg[] = [...messages, { role: 'user', content }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setStreaming(true);
    abort.current = new AbortController();
    sentenceBuf.current = '';
    let reply = '';
    try {
      await askTeacher(
        history,
        { ...ctxRef.current, challenge: challengeNote },
        (t) => {
          reply += t;
          setMessages([...history, { role: 'assistant', content: reply }]);
          setUnread(true);
          feedSpeech(t);
        },
        abort.current.signal,
      );
      feedSpeech('', true);
      if (!reply.trim()) setMessages(history);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setMessages(history);
      setError((e as Error).message);
    } finally {
      setStreaming(false);
    }
  };

  // ---- voice in: push to talk ----
  const toggleMic = () => {
    if (listening) {
      recog.current?.stop();
      return;
    }
    const R = getRecognizer();
    if (!R) return;
    stopSpeaking(); // so she doesn't hear herself
    const r = new R();
    r.lang = 'en-US';
    r.interimResults = true;
    r.continuous = false;
    let finalText = '';
    r.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText = text;
      }
      setInterim(text);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed') setError('The browser is not allowed to use the microphone. You can type instead!');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setError("I couldn't hear that. Try again, or type your question.");
    };
    r.onend = () => {
      setListening(false);
      recog.current = null;
      if (finalText.trim()) void send(finalText);
      else setInterim('');
    };
    recog.current = r;
    setListening(true);
    r.start();
  };

  const setVoice = (v: boolean) => {
    setVoiceState(v);
    try {
      localStorage.setItem(VOICE_KEY, v ? '1' : '0');
    } catch {
      /* fine */
    }
    if (!v) stopSpeaking();
  };

  const lastTeacher = [...messages].reverse().find((m) => m.role === 'assistant' && m.content)?.content ?? '';
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  if (!consent) {
    return (
      <div className="call-backdrop" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <div className="consent card">
          <h2 id="consent-title">📹 Before your first live class</h2>
          <p>
            <strong>For a parent or teacher:</strong> Ms. Nova is an <strong>AI</strong>, not a person
            {provider === 'local'
              ? '. Her AI runs on this computer (Ollama), so nothing your child types is sent to the internet.'
              : provider === 'claude'
                ? ' (Claude, made by Anthropic).'
                : '.'}{' '}
            She only talks about robotics, AI and this app, and she reminds kids never to share personal details.
          </p>
          <ul>
            {provider === 'local' ? (
              <li>Questions and answers stay on this computer. Names, addresses, phone numbers and school names are removed before the AI even sees a message.</li>
            ) : (
              <li>What your child types or says, plus a short note about what the app shows (tab, arm status), is sent to the AI to get an answer. Names, addresses, phone numbers and school names are removed first.</li>
            )}
            <li>GRIP does not save or log the conversation. It disappears when the call ends.</li>
            <li>Talking with the 🎤 button uses the browser's own speech service (in Chrome, audio goes to Google to turn it into text). Typing works too.</li>
            <li>AI can make mistakes. Please stay nearby, especially with the real robot.</li>
          </ul>
          <div className="row">
            <button
              className="btn primary big"
              onClick={() => {
                try {
                  localStorage.setItem(CONSENT_KEY, '1');
                } catch {
                  /* fine */
                }
                setConsent(true);
              }}
            >
              ✅ I'm a grown-up, and I allow the AI teacher
            </button>
            <button className="btn" onClick={onLeave}>
              Not now
            </button>
          </div>
        </div>
      </div>
    );
  }

  const talking = speaking || (streaming && !voice);

  if (mini) {
    return (
      <div className="call-mini" role="dialog" aria-modal="false" aria-label="Live class with Ms. Nova (small window)">
        <div className={`tile teacher-tile ${talking ? 'speaking' : ''}`}>
          <TeacherAvatar talking={talking} listening={listening} thinking={streaming && !speaking && !lastTeacher.length} />
          <span className="name-tag">
            <span className="live-dot" aria-hidden="true" /> Ms. Nova · {mm}:{ss}
          </span>
        </div>
        <p className="mini-subtitle" aria-live="polite">
          {listening ? `🎤 ${interim || 'Listening…'}` : streaming && !lastTeacher ? 'Ms. Nova is thinking…' : lastTeacher || 'Try something with the robot. Ask me if you get stuck!'}
        </p>
        {focusBar}
        {challenge && (
          <div className="mini-step">
            {challengeDone ? (
              <span>
                🏅 {challenge.title}: done!
              </span>
            ) : ticks.length === challenge.steps.length ? (
              <button className="btn primary small" onClick={finishChallenge}>
                🎉 I did it!
              </button>
            ) : (
              (() => {
                const i = challenge.steps.findIndex((_, k) => !ticks.includes(k));
                if (challenge.quiz) {
                  return (
                    <button className="btn small" onClick={() => setMini(false)}>
                      ❓ Question {i + 1}/{challenge.steps.length}: answer it on your sheet
                    </button>
                  );
                }
                return (
                  <label>
                    <input type="checkbox" checked={false} onChange={() => toggleTick(i)} />
                    <span>
                      <strong>
                        {challenge.icon} Step {i + 1}/{challenge.steps.length}:
                      </strong>{' '}
                      {challenge.steps[i]}
                    </span>
                  </label>
                );
              })()
            )}
          </div>
        )}
        {error && (
          <p className="callout warn mini-error" role="alert">
            {error}
          </p>
        )}
        <div className="mini-bar" role="toolbar" aria-label="Call controls">
          <button
            className={`call-btn ${listening ? 'on' : ''}`}
            onClick={toggleMic}
            disabled={!canListen || online === false || streaming}
            aria-pressed={listening}
            title={canListen ? 'Press, then ask your question out loud' : 'This browser cannot listen'}
          >
            <span aria-hidden="true">{listening ? '⏹' : '🎤'}</span>
            <span>{listening ? 'Stop' : 'Talk'}</span>
          </button>
          <button className="call-btn" disabled={streaming || online === false} onClick={() => send("✋ I need help with what I'm doing right now in the app.")}>
            <span aria-hidden="true">✋</span>
            <span>Help</span>
          </button>
          <button className="call-btn" onClick={() => setMini(false)} title="Back to the full class">
            <span aria-hidden="true">⤢</span>
            <span>Class</span>
          </button>
          <button
            className="call-btn leave"
            onClick={() => {
              stopSpeaking();
              onLeave();
            }}
          >
            <span aria-hidden="true">📞</span>
            <span>Leave</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="call-backdrop" role="dialog" aria-modal="true" aria-label="Live class with Ms. Nova, the AI teacher">
      <div className="call">
        <header className="call-top">
          <span className="live-dot" aria-hidden="true" /> <strong>LIVE</strong>
          <span className="call-title">Physical AI class · {mm}:{ss}</span>
          {voices.length > 0 && (
            <label className="voice-pick">
              <span aria-hidden="true">🗣️</span>
              <span className="sr-only">Ms. Nova's voice</span>
              <select value={voiceName} onChange={(e) => chooseVoice(e.target.value)}>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="ai-badge">
            🤖 AI teacher{provider === 'local' ? ' · runs on this computer' : provider === 'claude' ? ' · Claude' : ''}
          </span>
        </header>

        {focusBar}
        {helper === false && (
          <p className="helper-hint">
            Tip for grown-ups: install the <strong>GRIP Focus Helper</strong> so Ms. Nova can spot game and video tabs (see
            the README).
          </p>
        )}
        <div className={`call-main ${chatOpen ? 'with-chat' : ''}`}>
          <section className="stage-tiles" aria-label="Video">
            <div className={`tile teacher-tile ${speaking || (streaming && !voice) ? 'speaking' : ''}`}>
              <TeacherAvatar talking={speaking || (streaming && !voice)} listening={listening} thinking={streaming && !speaking && !lastTeacher.length} />
              <span className="name-tag">Ms. Nova · AI teacher {speaking ? '🔊' : ''}</span>
              {online === false && (
                <div className="offline">
                  <p>📴 Ms. Nova is offline.</p>
                  <p className="hint">
                    A grown-up needs to start the teacher server and add the API key. See “AI teacher” in the README.
                  </p>
                </div>
              )}
              <div className="subtitle" aria-hidden="true">
                {listening ? `🎤 ${interim || 'Listening…'}` : lastTeacher}
              </div>
            </div>
            <div className={`tile self-tile ${listening ? 'speaking' : ''}`}>
              <span className="self-avatar" aria-hidden="true">
                🧑‍🔬
              </span>
              <span className="name-tag">You · camera off</span>
            </div>
          </section>

          {chatOpen && (
            <aside className="chat" aria-label="Challenge sheet and class chat">
              <div className="panel-tabs" role="tablist">
                <button role="tab" aria-selected={panel === 'sheet'} className={panel === 'sheet' ? 'active' : ''} onClick={() => setPanel('sheet')}>
                  📋 Challenge {challenge && `${ticks.length}/${challenge.steps.length}`}
                </button>
                <button
                  role="tab"
                  aria-selected={panel === 'chat'}
                  className={panel === 'chat' ? 'active' : ''}
                  onClick={() => {
                    setPanel('chat');
                    setUnread(false);
                  }}
                >
                  💬 Chat {unread && panel !== 'chat' && <span className="unread-dot" aria-label="new message" />}
                </button>
              </div>
              {panel === 'sheet' && challenge ? (
                <div className="sheet-scroll">
                  <ChallengeSheet
                    challenge={challenge}
                    classNo={progress.classes}
                    ticks={ticks}
                    notes={progress.notes[challenge.id] ?? ''}
                    done={challengeDone}
                    showBonus={showBonus}
                    onTick={toggleTick}
                    onNotes={(text) => setProgress({ ...progress, notes: { ...progress.notes, [challenge.id]: text.slice(0, 500) } })}
                    onDone={finishChallenge}
                  />
                </div>
              ) : (
              <>
              <div className="chat-log" ref={transcript} aria-live="polite">
                {messages.map((m, i) =>
                  m.content ? (
                    <p key={i} className={`bubble ${m.role}`}>
                      <span className="who">{m.role === 'assistant' ? 'Ms. Nova (AI)' : 'You'}</span>
                      {m.content}
                    </p>
                  ) : (
                    <p key={i} className="bubble assistant typing">
                      <span className="who">Ms. Nova (AI)</span>…
                    </p>
                  ),
                )}
              </div>
              <div className="chips">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chip-btn" disabled={streaming || online === false} onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
              <form
                className="chat-input"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(draft);
                }}
              >
                <input
                  value={draft}
                  maxLength={600}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask Ms. Nova… (don't share your name or address)"
                  aria-label="Type a question for Ms. Nova"
                  disabled={online === false}
                />
                <button className="btn primary" disabled={!draft.trim() || streaming || online === false}>
                  Send
                </button>
              </form>
              </>
              )}
              {error && (
                <p className="callout warn" role="alert">
                  {error}
                </p>
              )}
            </aside>
          )}
        </div>

        <footer className="call-bar" role="toolbar" aria-label="Call controls">
          <button
            className={`call-btn ${listening ? 'on' : ''}`}
            onClick={toggleMic}
            disabled={!canListen || online === false || streaming}
            aria-pressed={listening}
            title={canListen ? 'Press, then ask your question out loud' : 'This browser cannot listen. Type instead!'}
          >
            <span aria-hidden="true">{listening ? '⏹' : '🎤'}</span>
            <span>{listening ? 'Stop' : 'Talk'}</span>
          </button>
          <button className="call-btn" onClick={() => setVoice(!voice)} aria-pressed={voice}>
            <span aria-hidden="true">{voice ? '🔊' : '🔇'}</span>
            <span>{voice ? 'Voice on' : 'Voice off'}</span>
          </button>
          <button className="call-btn try-robot" onClick={() => setMini(true)} title="Shrink the class to a small window and try things with the robot">
            <span aria-hidden="true">🤖</span>
            <span>Try robot</span>
          </button>
          <button className="call-btn" onClick={() => setChatOpen((c) => !c)} aria-pressed={chatOpen}>
            <span aria-hidden="true">💬</span>
            <span>Chat</span>
          </button>
          <button className="call-btn" disabled={streaming || online === false} onClick={() => send("✋ I need help with what I'm doing right now in the app.")}>
            <span aria-hidden="true">✋</span>
            <span>Raise hand</span>
          </button>
          <button
            className="call-btn leave"
            onClick={() => {
              stopSpeaking();
              onLeave();
            }}
          >
            <span aria-hidden="true">📞</span>
            <span>Leave</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
