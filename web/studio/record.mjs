#!/usr/bin/env node
/**
 * Records the how-to videos: drives the real app (pretend arms) in the studio page while
 * Maya and Ms. Nova talk, captures the screen, then builds MP4 + captions + poster.
 *
 *   node record.mjs [videoId ...]      (needs the app at GRIP_URL, default http://localhost:5173/)
 *
 * Output: ../public/videos/<id>.mp4, <id>.vtt, <id>.jpg and index.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.GRIP_URL ?? 'http://localhost:5173/';
const CHROME = process.env.CHROME ?? '/usr/bin/google-chrome';
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const OUT = path.join(here, '..', 'public', 'videos');
const BUILD = path.join(here, 'build');
fs.mkdirSync(OUT, { recursive: true });

const spec = JSON.parse(fs.readFileSync(path.join(here, 'videos.json'), 'utf8'));
const voices = JSON.parse(fs.readFileSync(path.join(BUILD, 'voices.json'), 'utf8'));
const only = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ff = (args) => execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

/** Three wave demos (same shape as the unit tests) for the training video. */
function waveDemos(n) {
  return Array.from({ length: n }, (_, d) => ({
    id: `demo-${d}`,
    task: 'wave',
    createdAt: new Date().toISOString(),
    frames: Array.from({ length: 91 }, (_, k) => {
      const t = k / 30;
      const pan = 40 * Math.sin((2 * Math.PI * t) / 3) + (d - 1) * 3;
      return { t, state: [pan * 0.95, -20, 30, 0, 0, 50], action: [pan, -20, 30, 0, 0, 50] };
    }),
  }));
}

async function record(video) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const url = new URL('?studio=1', BASE).href;
  await page.goto(url);
  await page.evaluate(
    ({ tab, demos }) => {
      localStorage.clear();
      localStorage.setItem('grip.tab', tab);
      localStorage.setItem('grip.teacher.voice', '0');
      localStorage.setItem('grip.learn.voice', '0');
      if (demos) localStorage.setItem('grip.episodes', JSON.stringify(demos));
    },
    { tab: video.tab, demos: video.seedDemos ? waveDemos(video.seedDemos) : null },
  );
  await page.reload();
  await page.waitForFunction(() => !!window.__studio);
  const frame = () => page.frames().find((f) => f.url().includes('studioApp'));
  await page.waitForFunction(() => document.querySelector('.app-frame')?.contentDocument?.querySelector('.tabs'));

  // Pip's own voice (the "say" block) is captured and mixed into the soundtrack.
  const pipAudio = [];
  page.on('response', async (r) => {
    if (r.url().endsWith('/api/voice') && r.request().method() === 'POST' && r.ok()) {
      const at = Date.now();
      try {
        pipAudio.push({ at, buf: await r.body() });
      } catch {
        /* ignore */
      }
    }
  });

  // Screen capture (high-quality frames with timestamps).
  const shots = path.join(BUILD, `${video.id}-frames`);
  fs.rmSync(shots, { recursive: true, force: true });
  fs.mkdirSync(shots);
  const frames = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', async (f) => {
    const file = path.join(shots, `${String(frames.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp * 1000 });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await page.evaluate(({ t, s }) => window.__studio.title(t, s), { t: video.title, s: video.subtitle });
  await sleep(300);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
  const t0 = Date.now();

  const screenBox = async () => (await page.locator('.studio-screen').boundingBox());
  const locate = (target) => {
    const f = frame();
    let scope = target.card !== undefined ? f.locator('.arm-card').nth(target.card) : f;
    if (target.css) return scope.locator(target.css).nth(target.index ?? 0);
    return scope.getByRole('button', { name: target.name, exact: target.exact ?? true }).first();
  };
  const pointAt = async (loc) => {
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const b = await loc.boundingBox();
    const s = await screenBox();
    if (!b || !s) return;
    await page.evaluate(({ x, y }) => window.__studio.cursor(x, y), { x: b.x - s.x + b.width / 2, y: b.y - s.y + b.height / 2 });
    await sleep(800);
  };
  const doAction = async (a) => {
    if (a.wait) return sleep(a.wait);
    if (a.point) return pointAt(locate(a.point));
    if (a.click) {
      const loc = locate(a.click);
      await loc.waitFor({ state: 'visible', timeout: 20000 });
      await pointAt(loc);
      await page.evaluate(() => window.__studio.click());
      await loc.click({ timeout: 30000 });
      return sleep(350);
    }
    if (a.select) {
      const loc = locate(a.select);
      await pointAt(loc);
      await page.evaluate(() => window.__studio.click());
      await loc.selectOption(a.select.value);
      return sleep(300);
    }
    if (a.slide) {
      const loc = locate(a.slide);
      await pointAt(loc);
      await loc.focus();
      for (let k = 0; k < a.slide.times; k++) {
        await loc.press(a.slide.key);
        await sleep(45);
      }
      return sleep(200);
    }
  };

  // Setup happens behind the title card.
  for (const a of video.setup ?? []) await doAction(a);
  await sleep(Math.max(0, 3200 - (Date.now() - t0)));
  await page.evaluate(() => window.__studio.hideTitle());
  await sleep(500);

  const said = [];
  for (let n = 0; n < video.lines.length; n++) {
    const line = video.lines[n];
    const v = voices[video.id][n];
    const start = Date.now();
    await page.evaluate(({ s, t, e, ms }) => window.__studio.say(s, t, e, ms), { s: v.speaker, t: v.text, e: v.envelope, ms: v.ms });
    said.push({ start, ms: v.ms, file: path.join(BUILD, `${video.id}_${n}.wav`), speaker: v.speaker, text: v.text });
    const acts = (async () => {
      await sleep(500);
      for (const a of line.do ?? []) await doAction(a);
    })();
    await Promise.all([sleep(v.ms), acts]);
    await sleep(450);
  }
  await page.evaluate((t) => window.__studio.outro(t), video.outro);
  await sleep(2800);
  await cdp.send('Page.stopScreencast');
  const tEnd = Date.now();
  await sleep(300);
  await browser.close();
  return { frames, said, pipAudio, t0, tEnd };
}

function build(video, { frames, said, pipAudio, t0, tEnd }) {
  const list = path.join(BUILD, `${video.id}-frames.txt`);
  const keep = frames.filter((f) => f.t >= t0 - 50).sort((a, b) => a.t - b.t);
  const lines = keep.map((f, i) => {
    const next = i + 1 < keep.length ? keep[i + 1].t : tEnd;
    return `file '${f.file}'\nduration ${Math.max(0.001, (next - Math.max(f.t, t0)) / 1000).toFixed(3)}`;
  });
  fs.writeFileSync(list, lines.join('\n') + `\nfile '${keep[keep.length - 1].file}'\n`);
  const silent = path.join(BUILD, `${video.id}-video.mp4`);
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', silent]);

  // Soundtrack: every line at the moment it was said (plus Pip's own voice).
  const pipFiles = pipAudio.map((p, i) => {
    const f = path.join(BUILD, `${video.id}-pip-${i}.wav`);
    fs.writeFileSync(f, p.buf);
    return { file: f, start: p.at };
  });
  const clips = [...said.map((s) => ({ file: s.file, start: s.start })), ...pipFiles];
  const inputs = clips.flatMap((c) => ['-i', c.file]);
  const filters = clips.map((c, i) => {
    const d = Math.max(0, c.start - t0);
    return `[${i}:a]aresample=48000,adelay=${d}|${d}[a${i}]`;
  });
  const mix = `${filters.join(';')};${clips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${clips.length}:normalize=0,apad[aout]`;
  const out = path.join(OUT, `${video.id}.mp4`);
  ff(['-i', silent, ...inputs, '-filter_complex', mix, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out]);

  // Captions (WebVTT) and a poster frame.
  const ts = (ms) => {
    const t = Math.max(0, ms) / 1000;
    const h = String(Math.floor(t / 3600)).padStart(2, '0');
    const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const s = (t % 60).toFixed(3).padStart(6, '0');
    return `${h}:${m}:${s}`;
  };
  const vtt = ['WEBVTT', '', ...said.flatMap((s, i) => [`${i + 1}`, `${ts(s.start - t0)} --> ${ts(s.start - t0 + s.ms)}`, `<v ${s.speaker === 'nova' ? 'Ms. Nova' : 'Maya'}>${s.text}`, ''])];
  fs.writeFileSync(path.join(OUT, `${video.id}.vtt`), vtt.join('\n'));
  ff(['-ss', '1.2', '-i', out, '-frames:v', '1', '-q:v', '3', path.join(OUT, `${video.id}.jpg`)]);
  return { seconds: Math.round((tEnd - t0) / 1000) };
}

const index = fs.existsSync(path.join(OUT, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8')) : [];
for (const video of spec.videos) {
  if (only.length && !only.includes(video.id)) continue;
  process.stdout.write(`recording ${video.id}... `);
  const rec = await record(video);
  const { seconds } = build(video, rec);
  console.log(`${seconds}s, ${rec.frames.length} frames, ${rec.pipAudio.length} Pip voice clip(s)`);
  const entry = { id: video.id, title: video.title, subtitle: video.subtitle, seconds };
  const i = index.findIndex((x) => x.id === video.id);
  if (i >= 0) index[i] = entry;
  else index.push(entry);
}
index.sort((a, b) => spec.videos.findIndex((v) => v.id === a.id) - spec.videos.findIndex((v) => v.id === b.id));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
console.log('wrote', OUT);
