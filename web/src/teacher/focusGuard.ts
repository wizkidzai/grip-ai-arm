/**
 * Focus helper: during a live class, finds game/video tabs through the optional
 * "GRIP Focus Helper" extension (web/extension). A web page can't see other tabs by itself.
 * The extension only ever reports site NAMES on its list (e.g. "YouTube").
 */
export interface DistractingTab {
  id: number;
  site: string;
}

let seq = 0;

function ask<T>(type: 'ping' | 'check' | 'close', extra: Record<string, unknown> = {}, timeoutMs = 800): Promise<T | null> {
  const req = ++seq;
  return new Promise((resolve) => {
    const done = (v: T | null) => {
      window.removeEventListener('message', onMsg);
      clearTimeout(t);
      resolve(v);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || e.data?.from !== 'grip-focus-helper' || e.data.req !== req) return;
      done(e.data as T);
    };
    const t = setTimeout(() => done(null), timeoutMs);
    window.addEventListener('message', onMsg);
    window.postMessage({ from: 'grip-app', type, req, ...extra }, window.location.origin);
  });
}

/** Is the extension installed (and allowed on this page)? */
export async function helperInstalled(): Promise<boolean> {
  return !!(await ask('ping'));
}

export async function distractingTabs(): Promise<DistractingTab[]> {
  const r = await ask<{ tabs?: DistractingTab[] }>('check', {}, 1500);
  return Array.isArray(r?.tabs) ? r!.tabs.filter((t) => Number.isInteger(t.id) && typeof t.site === 'string') : [];
}

export async function closeTab(id: number): Promise<boolean> {
  const r = await ask<{ closed?: boolean }>('close', { id }, 1500);
  return !!r?.closed;
}

/** "YouTube", "YouTube and Roblox", "YouTube, Roblox and TikTok" */
export function siteList(sites: string[]): string {
  const u = [...new Set(sites)];
  return u.length <= 1 ? u.join('') : `${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}`;
}
