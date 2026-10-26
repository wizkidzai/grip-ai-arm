#!/usr/bin/env node
/**
 * Ms. Nova, the GRIP AI teacher: a tiny local server between the web app and Claude.
 *
 *   node server/teacher.mjs            # listens on http://127.0.0.1:8787
 *
 * Two ways to run the teacher's AI:
 *  - Local (default, free, nothing leaves this computer): Ollama on this computer
 *    (https://ollama.com). Pick a model with GRIP_OLLAMA_MODEL, e.g. llama3.2:3b.
 *  - Claude: if ANTHROPIC_API_KEY (or an `ant auth login` profile) is set. The key stays
 *    on this server and is never sent to the browser.
 *
 * Child safety & privacy: messages are not stored or logged; inputs are size-limited;
 * requests are rate-limited; the system prompt keeps the teacher on topic and kid-safe.
 */
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';

const PORT = Number(process.env.GRIP_TEACHER_PORT ?? 8787);
const HOST = '127.0.0.1';
const MODEL = 'claude-opus-5-5';
const MAX_MESSAGES = 30; // conversation turns kept
const MAX_CHARS = 600; // per learner message
const RATE = { windowMs: 10 * 60 * 1000, max: 40 }; // requests per window per client
const OLLAMA = process.env.GRIP_OLLAMA_URL ?? 'http://127.0.0.1:11434';
// Best first: general chat models that follow instructions well and answer quickly on a laptop.
// Ranked by testing as Ms. Nova on this kind of laptop: accuracy about the app first, then speed.
const PREFERRED_LOCAL = ['qwen2.5:7b', 'qwen2.5-coder:7b', 'gemma3:4b', 'llama3.1:8b', 'llama3.2:3b', 'qwen2.5:3b'];

const SYSTEM = `You are Ms. Nova, a friendly AI teacher for robotics and physical AI inside the GRIP app.
GRIP helps girls aged 8 to 17 learn robotics and physical AI by doing it with a real SO-ARM101 robot arm kit.
You are talking to one learner in a live video-call style lesson. Your words are read aloud by a speech voice.

How to talk
- Speak like a warm, upbeat teacher. Use short, simple sentences: 1 to 4 sentences, under about 70 words.
- Plain spoken text only: no markdown, no bullet lists, no code blocks, no links, no emojis.
- Match the learner's level (given in the screen note): explorer (8-10) very simple and playful; builder (11-13) explain how things work; engineer (14-17) real terms and numbers.
- Teach by asking: often end with one small question or a next step to try in the app.
- Praise effort and strategies, not "being smart". Mistakes are experiments. Never use stereotypes about what girls like or can do.
- When it fits, mention real women in robotics and AI (for example Ayanna Howard, Cynthia Breazeal, Daniela Rus, Fei-Fei Li), keeping facts simple and accurate.

What you know about the robot and the app
- The kit has two arms. The leader arm (trigger handle, 5 volt power) is moved by hand. The follower arm (gripper jaws, 12 volt power) copies it.
- Six joints: base spin, shoulder, elbow, wrist tilt, wrist spin, and the hand (gripper). Angles are in degrees; 0 is the middle.
- App tabs: Connect (connect real or pretend arms, calibrate, motors on), Drive (poses and sliders), Code (Scratch-style blocks), Teach ("Copy me": the follower copies the leader; record demos), Train (a small neural network learns from the demos by imitation learning; the "mistakes" line goes down), Try it (the trained brain drives; test it 10 times and count the success rate), Settings.
- The Teach me button opens the GRIP Academy with six classes and missions.
- Every live class you hand the learner a challenge sheet (described in the screen note). Coach them through it one step at a time, starting with the first step marked "to do". Do not invent a different challenge or extra steps. When they finish, celebrate their effort.
- Safety: the big red STOP button (or the Esc key) stops the arm. Hands clear before pressing go. Use slow speed first.
- A screen note tells you what the learner's app shows right now. Use it to give specific help. You cannot press buttons or move the robot yourself; tell the learner what to click.

Safety rules (always)
- You are an AI, not a human. If asked, say so. You can make mistakes; say so when unsure.
- Never ask for personal information (name, age, school, address, phone, email, photos, location). If the learner shares any, gently remind them not to share personal details online, and do not repeat it.
- Stay on robotics, AI, coding, science, math and the app. Kindly steer other topics back to robots.
- If the learner seems sad, hurt, unsafe or mentions bullying or harm, respond kindly and tell them to talk to a trusted adult right away, like a parent, teacher or school counselor.
- Never suggest opening power supplies, changing voltages, removing safety limits, or touching a moving arm. For hardware or electrical problems, tell them to ask a grown-up.
- No romantic, violent, scary, or adult content. No medical, legal or money advice.`;

// ---------------------------------------------------------------------------

const client = new Anthropic(); // resolves ANTHROPIC_API_KEY / auth token / ant profile

// ---- privacy: personal details never reach the AI --------------------------------
const PII = [
  [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, 'email'],
  [/(\+?\d[\d\s().-]{7,}\d)/g, 'phone'],
  [/\b\d{1,5}\s+(?:[A-Za-z]+\s){1,3}(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|way|boulevard|blvd|place|pl|circle|cir)\b\.?/gi, 'address'],
  [/\b(my name is|my name's|call me|i am called|i'm called)\s+[A-Za-z][\w'-]*/gi, 'name'],
  [/\b(i live (?:at|in|on)|my address is)\s+[^.,!?\n]{2,60}/gi, 'address'],
  [/\b(i go to|my school is|i'm at|i am at)\s+[^.,!?\n]{0,40}\b(school|academy|elementary|middle|high)\b[^.,!?\n]{0,20}/gi, 'school'],
];

/** Replace personal details with [private]. Returns the cleaned text and whether anything was removed. */
export function redact(text) {
  let found = false;
  let out = text;
  for (const [re, kind] of PII) {
    out = out.replace(re, (m, lead) => {
      found = true;
      return kind === 'name' || (kind === 'address' && /^(i live|my address)/i.test(m)) || kind === 'school'
        ? `${lead} [private]`
        : '[private]';
    });
  }
  return { text: out, found };
}

// ---- which AI runs the teacher -------------------------------------------------------
async function localModels() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1500) });
    const j = await r.json();
    return (j.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}

async function pickProvider() {
  if (await hasCredentials()) return { provider: 'claude', model: MODEL };
  const have = await localModels();
  const want = process.env.GRIP_OLLAMA_MODEL;
  const model = (want && have.includes(want) ? want : null) ?? PREFERRED_LOCAL.find((m) => have.includes(m)) ?? have[0];
  return model ? { provider: 'local', model } : { provider: 'none', model: null };
}

/** Extra rules for small local models, which drift and invent things more than Claude. */
const LOCAL_RULES = `Extra rules (very important)
- Answer in 2 or 3 short sentences, under 50 words. Never write more.
- Only mention buttons and features named in this prompt. Never invent buttons, menus or settings. If you are not sure how the app does something, say "I'm not sure, let's check together" and suggest the Teach me button.
- Facts: squeezing the leader's trigger CLOSES the follower's hand (to hold things); letting go OPENS it. If the hand moves the wrong way, click "Hand goes the wrong way? Flip it" in the Teach tab. The robot brain learns by imitation learning: it copies your demos to guess the next move (no rewards). The Settings tab only deletes saved things like demos and brains.
- If personal details were replaced with [private], never say "[private]" and never greet the learner by name.
- If the learner is stuck, help with the first challenge step marked "to do", using only the words on the sheet.`;

/** Stream a reply from Ollama on this computer. */
async function streamLocal(model, messages, note, onText, signal) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    signal,
    body: JSON.stringify({
      model,
      stream: true,
      keep_alive: '8h', // stay loaded so answers start quickly
      options: { temperature: 0.3, num_predict: 120, num_ctx: 4096 },
      // One system message up front: a trailing system turn confuses some local chat templates.
      messages: [{ role: 'system', content: `${SYSTEM}\n\n${LOCAL_RULES}\n\n${note}` }, ...messages],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`local AI error ${res.status}`);
  // Some models start with a stray role word ("assistant"); hold the first few characters back to drop it.
  let head = '';
  let started = false;
  const tidy = (t) => t.replace(/\s*\[private\]/gi, ''); // never say the privacy placeholder out loud
  const emit = (text, flush = false) => {
    if (started) return text && onText(tidy(text));
    head += text;
    if (head.length < 16 && !flush) return;
    started = true;
    const clean = head.replace(/^\s*(assistant|ms\.? nova)\s*:?\s*/i, '');
    if (clean) onText(tidy(clean));
  };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const j = JSON.parse(line);
      if (j.error) throw new Error(j.error);
      if (j.message?.content) emit(j.message.content);
    }
  }
  emit('', true);
}

const hits = new Map(); // client -> recent request times (in memory only)
function rateLimited(key) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < RATE.windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > RATE.max;
}

const LEVELS = new Set(['explorer', 'builder', 'engineer']);
const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

/** Validate the browser's request; returns { messages, note } or throws a friendly Error. */
function parseRequest(body) {
  if (!body || !Array.isArray(body.messages)) throw new Error('bad request');
  const messages = body.messages
    .slice(-MAX_MESSAGES)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, m.role === 'user' ? MAX_CHARS : 2000) }))
    .filter((m) => m.content.trim());
  while (messages.length && messages[0].role !== 'user') messages.shift();
  let shared = false;
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const r = redact(m.content);
    m.content = r.text;
    if (r.found && m === messages[messages.length - 1]) shared = true;
  }
  if (!messages.length || messages[messages.length - 1].role !== 'user') throw new Error('bad request');
  const c = body.context && typeof body.context === 'object' ? body.context : {};
  const level = LEVELS.has(c.level) ? c.level : 'explorer';
  const note = [
    `Screen note (from the app, not from the learner): level=${level}`,
    `tab=${clip(c.tab, 20) || 'unknown'}`,
    `leader=${clip(c.leader, 40) || 'not connected'}`,
    `follower=${clip(c.follower, 60) || 'not connected'}`,
    `robot is doing: ${clip(c.mode, 30) || 'resting'}`,
    `academy mission: ${clip(c.mission, 80) || 'none'}`,
    `saved demos: ${Number.isFinite(c.demos) ? c.demos : 0}, trained brains: ${Number.isFinite(c.brains) ? c.brains : 0}`,
    c.lastMessage ? `last app message: ${clip(c.lastMessage, 160)}` : '',
    c.challenge ? `today's challenge sheet: ${clip(c.challenge, 900)}` : '',
  ]
    .filter(Boolean)
    .join('; ') +
    (shared
      ? '. PRIVACY: the learner just tried to share personal details; they were removed and replaced with [private]. Do not use or guess them. Kindly remind the learner never to share personal details like their name, address or school online, then keep teaching.'
      : '');
  return { messages, note, shared };
}

/** Said first, every time personal details were removed (doesn't rely on the AI remembering). */
const PRIVACY_REMINDER = "Quick reminder: please don't share personal details like your name, address or school online. ";

function send(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function hasCredentials() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || client.apiKey || client.authToken);
}

const server = http.createServer(async (req, res) => {
  // Only the app on this computer may call this server.
  const origin = req.headers.origin;
  if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return send(res, 403, { error: 'forbidden' });
  if (origin) res.setHeader('access-control-allow-origin', origin);

  if (req.method === 'GET' && req.url === '/api/teacher/health') {
    const p = await pickProvider();
    return send(res, 200, { ok: true, ready: p.provider !== 'none', provider: p.provider, model: p.model });
  }
  if (req.method !== 'POST' || req.url !== '/api/teacher/chat') return send(res, 404, { error: 'not found' });
  if (rateLimited(req.socket.remoteAddress ?? 'local')) {
    return send(res, 429, { error: "Let's take a short break! Try again in a few minutes." });
  }

  let parsed;
  try {
    parsed = parseRequest(JSON.parse(await readBody(req)));
  } catch {
    return send(res, 400, { error: 'Something was wrong with that message. Try again.' });
  }

  // Stream plain-text deltas to the browser as Server-Sent Events.
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const event = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  const controller = new AbortController();
  res.on('close', () => controller.abort());

  if (parsed.shared) event('text', { text: PRIVACY_REMINDER });
  const provider = await pickProvider();
  if (provider.provider === 'none') {
    event('error', { error: 'The AI teacher has no AI to use yet. Ask a grown-up to install Ollama and a model (see the README).' });
    return res.end();
  }
  if (provider.provider === 'local') {
    try {
      await streamLocal(provider.model, parsed.messages, parsed.note, (text) => event('text', { text }), controller.signal);
      event('done', {});
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('local teacher error:', err?.message ?? err);
        event('error', { error: "Ms. Nova's brain on this computer isn't answering. Is Ollama running?" });
      }
    } finally {
      res.end();
    }
    return;
  }

  try {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 2000, // spoken answers are deliberately short
        output_config: { effort: 'low' }, // chat: quick answers
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default', // if a reply is declined, the API retries on Anthropic's recommended model
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [...parsed.messages, { role: 'system', content: parsed.note }],
      },
      { signal: controller.signal },
    );
    stream.on('text', (text) => event('text', { text }));
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      event('text', { text: "Hmm, I can't help with that one. Let's get back to robots! What would you like to build?" });
    }
    event('done', {});
  } catch (err) {
    if (controller.signal.aborted) return;
    let msg = "Ms. Nova's connection dropped. Try again in a moment.";
    if (err instanceof Anthropic.AuthenticationError) msg = 'The AI teacher is not set up yet. Ask a grown-up to add the API key.';
    else if (err instanceof Anthropic.RateLimitError) msg = 'Lots of students right now! Try again in a minute.';
    else if (err instanceof Anthropic.APIError) msg = `The AI service had a problem (${err.status ?? 'error'}). Try again soon.`;
    else if (!(await hasCredentials())) msg = 'The AI teacher is not set up yet. Ask a grown-up to add the API key (see the README).';
    console.error('teacher error:', err?.status ?? '', err?.name ?? err); // never logs what the learner said
    event('error', { error: msg });
  } finally {
    res.end();
  }
});

server.listen(PORT, HOST, async () => {
  const p = await pickProvider();
  console.log(`Ms. Nova (AI teacher) on http://${HOST}:${PORT}  provider=${p.provider}  model=${p.model ?? '-'}`);
  if (p.provider === 'local') {
    // Load the model AND read Ms. Nova's instructions now. Ollama remembers text it has already
    // read, so the first real question only has to read the short screen note and the question.
    fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({
        model: p.model,
        stream: false,
        keep_alive: '8h',
        options: { num_predict: 1, num_ctx: 4096 },
        messages: [{ role: 'system', content: `${SYSTEM}\n\n${LOCAL_RULES}\n\n` }, { role: 'user', content: 'hi' }],
      }),
    })
      .then(() => console.log('local model loaded and ready'))
      .catch(() => console.log('could not pre-load the local model'));
  }
});
